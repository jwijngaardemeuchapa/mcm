use tauri::Emitter;
use tauri_plugin_sql::{Migration, MigrationKind};

fn strip_accents(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'à' | 'á' | 'â' | 'ã' | 'ä' => 'a',
            'è' | 'é' | 'ê' | 'ë' => 'e',
            'ì' | 'í' | 'î' | 'ï' => 'i',
            'ò' | 'ó' | 'ô' | 'õ' | 'ö' => 'o',
            'ù' | 'ú' | 'û' | 'ü' => 'u',
            'ç' => 'c',
            'ñ' => 'n',
            _ => c,
        })
        .collect()
}

/// Tokeniza o nome em palavras significativas (>= 3 chars, fora conectivos)
/// e exige pelo menos 2 matches no payload — ou 1 se o nome só tem 1 palavra.
/// Tolerante a apelidos, parênteses, sufixos ("Filho", "Junior") e ordem.
fn name_matches_payload(chapa_name_norm: &str, payload_norm: &str) -> bool {
    const CONNECTIVES: &[&str] = &[
        "de", "da", "do", "dos", "das", "e",
        "di", "du", "del", "della", "lo", "la", "san",
    ];

    let significant: Vec<&str> = chapa_name_norm
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty() && w.len() >= 3 && !CONNECTIVES.contains(w))
        .collect();

    if significant.is_empty() {
        return false;
    }

    let match_count: usize = significant
        .iter()
        .filter(|w| payload_norm.contains(*w))
        .count();

    if significant.len() == 1 {
        // Nome com uma palavra só: exige match, e que tenha pelo menos 4 chars
        // pra evitar falso-positivo com sobrenomes muito curtos
        match_count == 1 && significant[0].len() >= 4
    } else {
        // Nome composto: o PRIMEIRO nome deve estar presente + pelo menos mais 1 palavra.
        // Isso evita que "Carlos Roberto Silva" case com payload de "João Roberto Silva"
        // mesmo que tenham 2 sobrenomes em comum — o primeiro nome é o desempate.
        let first_name_present = payload_norm.contains(significant[0]);
        first_name_present && match_count >= 2
    }
}

/// Detecta resposta BID (curta) no payload normalizado.
/// Ignora payloads longos e frases do FUP para evitar falsos positivos.
fn detect_bid_response(payload_norm: &str) -> Option<&'static str> {
    // Skip FUP phrases
    if payload_norm.contains("nessa") || payload_norm.contains("quero cancelar") {
        return None;
    }
    // "Preciso de ajuda" é específico o suficiente para detecção automática
    if payload_norm.contains("preciso de ajuda") || payload_norm.contains("preciso ajuda") {
        return Some("precisa_ajuda");
    }
    // Só processa mensagens curtas (≤4 palavras) para evitar falsos positivos
    let words: Vec<&str> = payload_norm
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .collect();
    if words.len() > 4 {
        return None;
    }
    let has_sim = words.iter().any(|w| *w == "sim");
    let has_nao = words.iter().any(|w| *w == "nao");
    if has_sim && !has_nao { Some("sim") }
    else if has_nao && !has_sim { Some("nao") }
    else { None }
}

/// Detecta resposta SIM/NÃO no payload normalizado. Tolerante a remoção
/// de pontuação e variações ("tô" vs "estou") — exige só a frase distintiva.
fn detect_response(payload_norm: &str) -> Option<&'static str> {
    let has_sim = payload_norm.contains("to nessa") || payload_norm.contains("estou nessa");
    let has_nao = payload_norm.contains("quero cancelar");

    if has_sim && !has_nao {
        Some("sim")
    } else if has_nao && !has_sim {
        Some("nao")
    } else {
        None
    }
}

#[derive(serde::Serialize)]
pub struct NotificationMatch {
    pub chapa_nome: String,
    pub resposta: String,       // "sim" ou "nao"
    pub arrival_time_secs: i64, // Unix epoch
}

/// Reads %LOCALAPPDATA%\Microsoft\Windows\Notifications\wpndatabase.db
/// (read-only) and returns notifications whose XML payload contains
/// "SIM, estou nessa!" or "NÃO, quero cancelar!" plus one of the
/// provided chapa names. Returns an empty Vec on any error so the
/// feature stays dormant when notifications are disabled or locked.
#[tauri::command]
fn check_notification_responses(
    chapa_names: Vec<String>,
    since_epoch_secs: i64,
) -> Vec<NotificationMatch> {
    use rusqlite::{Connection, OpenFlags};

    let mut results: Vec<NotificationMatch> = Vec::new();

    let local_app_data = match std::env::var("LOCALAPPDATA") {
        Ok(v) => v,
        Err(_) => return results,
    };

    let db_path = format!(
        r"{}\Microsoft\Windows\Notifications\wpndatabase.db",
        local_app_data
    );

    let conn = match Connection::open_with_flags(
        &db_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    ) {
        Ok(c) => c,
        Err(_) => return results,
    };

    // Windows FILETIME = 100-ns intervals since 1601-01-01.
    // Offset to Unix epoch: 11,644,473,600 s.
    let since_filetime = (since_epoch_secs + 11_644_473_600_i64)
        .saturating_mul(10_000_000_i64);

    let sql = "SELECT CAST(Payload AS TEXT), ArrivalTime \
               FROM Notification WHERE ArrivalTime > ? \
               ORDER BY ArrivalTime ASC LIMIT 200";

    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return results,
    };

    let rows: Vec<(String, i64)> = match stmt.query_map([since_filetime], |row| {
        let payload: String = row.get::<_, String>(0).unwrap_or_default();
        let arrival: i64 = row.get(1).unwrap_or(0);
        Ok((payload, arrival))
    }) {
        Ok(iter) => iter.flatten().collect(),
        Err(_) => return results,
    };

    // Normalize names: lowercase + strip accents for robust matching
    let names_norm: Vec<(String, String)> = chapa_names
        .iter()
        .map(|n| (n.clone(), strip_accents(&n.to_lowercase())))
        .collect();

    for (payload, arrival_filetime) in rows {
        let arrival_unix =
            (arrival_filetime / 10_000_000).saturating_sub(11_644_473_600_i64);

        let payload_lower = payload.to_lowercase();
        let payload_norm = strip_accents(&payload_lower);

        let resposta = match detect_response(&payload_norm) {
            Some(r) => r,
            None => continue,
        };

        if names_norm.is_empty() {
            // Modo teste: sem filtro de nome — retorna qualquer SIM/NÃO
            results.push(NotificationMatch {
                chapa_nome: String::new(),
                resposta: resposta.to_string(),
                arrival_time_secs: arrival_unix,
            });
        } else {
            for (original, norm) in &names_norm {
                if name_matches_payload(norm, &payload_norm) {
                    results.push(NotificationMatch {
                        chapa_nome: original.clone(),
                        resposta: resposta.to_string(),
                        arrival_time_secs: arrival_unix,
                    });
                    break;
                }
            }
        }
    }

    results
}

#[derive(serde::Serialize)]
pub struct BidResponseMatch {
    pub chapa_nome: String,
    pub resposta: String,       // "sim" | "nao" | "precisa_ajuda"
    pub arrival_time_secs: i64,
}

/// Lê wpndatabase.db e retorna respostas BID de chapas da lista fornecida.
/// Detecta: "SIM"/"NÃO" curtos (≤4 palavras) e "Preciso de ajuda".
/// Ignora frases do FUP ("nessa", "quero cancelar") para não conflitar.
#[tauri::command]
fn check_bid_responses(
    chapa_names: Vec<String>,
    since_epoch_secs: i64,
) -> Vec<BidResponseMatch> {
    use rusqlite::{Connection, OpenFlags};
    let mut results: Vec<BidResponseMatch> = Vec::new();
    if chapa_names.is_empty() { return results; }

    let local_app_data = match std::env::var("LOCALAPPDATA") {
        Ok(v) => v,
        Err(_) => return results,
    };
    let db_path = format!(
        r"{}\Microsoft\Windows\Notifications\wpndatabase.db",
        local_app_data
    );
    let conn = match Connection::open_with_flags(
        &db_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    ) {
        Ok(c) => c,
        Err(_) => return results,
    };
    let since_filetime = (since_epoch_secs + 11_644_473_600_i64).saturating_mul(10_000_000_i64);
    let sql = "SELECT CAST(Payload AS TEXT), ArrivalTime \
               FROM Notification WHERE ArrivalTime > ? \
               ORDER BY ArrivalTime ASC LIMIT 200";
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return results,
    };
    let rows: Vec<(String, i64)> = match stmt.query_map([since_filetime], |row| {
        let payload: String = row.get::<_, String>(0).unwrap_or_default();
        let arrival: i64 = row.get(1).unwrap_or(0);
        Ok((payload, arrival))
    }) {
        Ok(iter) => iter.flatten().collect(),
        Err(_) => return results,
    };
    let names_norm: Vec<(String, String)> = chapa_names
        .iter()
        .map(|n| (n.clone(), strip_accents(&n.to_lowercase())))
        .collect();
    for (payload, arrival_filetime) in rows {
        let arrival_unix = (arrival_filetime / 10_000_000).saturating_sub(11_644_473_600_i64);
        let payload_lower = payload.to_lowercase();
        let payload_norm = strip_accents(&payload_lower);
        let resposta = match detect_bid_response(&payload_norm) {
            Some(r) => r,
            None => continue,
        };
        for (original, norm) in &names_norm {
            if name_matches_payload(norm, &payload_norm) {
                results.push(BidResponseMatch {
                    chapa_nome: original.clone(),
                    resposta: resposta.to_string(),
                    arrival_time_secs: arrival_unix,
                });
                break;
            }
        }
    }
    results
}

/// Copies fupmanager.db to Documents/MCM/fupmanager_backup_<timestamp>.db
/// Returns the full path of the created backup file.
#[tauri::command]
fn backup_database(app: tauri::AppHandle) -> Result<String, String> {
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};
    use tauri::Manager;

    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Erro ao localizar dados do aplicativo: {e}"))?;

    let source = app_data.join("fupmanager.db");
    if !source.exists() {
        return Err(
            "Banco de dados não encontrado. Utilize o aplicativo antes de fazer backup.".into(),
        );
    }

    let documents = app
        .path()
        .document_dir()
        .map_err(|e| format!("Erro ao localizar pasta Documentos: {e}"))?;

    let backup_dir = documents.join("MCM");
    fs::create_dir_all(&backup_dir)
        .map_err(|e| format!("Erro ao criar pasta de backup: {e}"))?;

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let filename = format!("fupmanager_backup_{ts}.db");
    let dest = backup_dir.join(&filename);

    fs::copy(&source, &dest)
        .map_err(|e| format!("Erro ao copiar banco de dados: {e}"))?;

    Ok(dest.to_string_lossy().to_string())
}

// ── Backup / Restore ─────────────────────────────────────────────────────

#[tauri::command]
fn export_db_base64(app: tauri::AppHandle) -> Result<String, String> {
    use std::fs;
    use tauri::Manager;
    use base64::{Engine as _, engine::general_purpose};

    let db_path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Erro ao localizar dados do aplicativo: {e}"))?
        .join("fupmanager.db");

    if !db_path.exists() {
        return Err("Banco de dados não encontrado.".into());
    }

    let bytes = fs::read(&db_path)
        .map_err(|e| format!("Erro ao ler banco de dados: {e}"))?;

    Ok(general_purpose::STANDARD.encode(&bytes))
}

#[tauri::command]
fn import_db_base64(app: tauri::AppHandle, data: String) -> Result<(), String> {
    use std::fs;
    use tauri::Manager;
    use base64::{Engine as _, engine::general_purpose};

    let bytes = general_purpose::STANDARD
        .decode(data.trim())
        .map_err(|e| format!("Dados de backup inválidos: {e}"))?;

    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Erro ao localizar dados do aplicativo: {e}"))?;

    // Backup automático do banco atual antes de sobrescrever
    let db_path = app_data.join("fupmanager.db");
    if db_path.exists() {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let _ = fs::copy(&db_path, app_data.join(format!("fupmanager_pre_restore_{ts}.db")));
    }

    fs::write(&db_path, &bytes)
        .map_err(|e| format!("Erro ao restaurar banco de dados: {e}"))?;

    Ok(())
}

// ── Ollama sidecar ────────────────────────────────────────────────────────

use std::sync::{Mutex, OnceLock};

static OLLAMA_CHILD: OnceLock<Mutex<Option<std::process::Child>>> = OnceLock::new();

fn ollama_mutex() -> &'static Mutex<Option<std::process::Child>> {
    OLLAMA_CHILD.get_or_init(|| Mutex::new(None))
}

fn find_ollama() -> String {
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let p = format!(r"{}\Programs\Ollama\ollama.exe", local);
        if std::path::Path::new(&p).exists() { return p; }
    }
    "ollama".to_string()
}

#[tauri::command]
fn start_ollama() -> Result<bool, String> {
    let mut guard = ollama_mutex().lock().unwrap();
    // Check if already alive
    if let Some(child) = guard.as_mut() {
        if let Ok(None) = child.try_wait() { return Ok(false); } // still running
        *guard = None; // was dead, respawn
    }
    let exe = find_ollama();
    let child = std::process::Command::new(&exe)
        .arg("serve")
        .spawn()
        .map_err(|e| format!("Não foi possível iniciar Ollama ({}): {}", exe, e))?;
    *guard = Some(child);
    Ok(true)
}

#[tauri::command]
fn stop_ollama() {
    let mut guard = ollama_mutex().lock().unwrap();
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

// ── Ollama HTTP proxy (bypasses WebView CORS) ─────────────────────────────

#[tauri::command]
async fn check_ollama() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .get("http://127.0.0.1:11434/api/tags")
        .send()
        .await
        .map_err(|_| "offline".to_string())?;
    if !res.status().is_success() {
        return Err("offline".to_string());
    }
    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

#[tauri::command]
async fn ollama_generate(
    prompt: String,
    system: String,
    model: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    use futures_util::StreamExt;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;
    let body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "system": system,
        "stream": true,
    });
    let res = client
        .post("http://127.0.0.1:11434/api/generate")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Erro ao conectar ao Ollama: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("Ollama retornou {}", res.status()));
    }
    let mut full = String::new();
    let mut stream = res.bytes_stream();
    let mut buf = String::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        buf.push_str(&String::from_utf8_lossy(&chunk));
        // Process complete lines
        while let Some(pos) = buf.find('\n') {
            let line = buf[..pos].trim().to_string();
            buf = buf[pos + 1..].to_string();
            if line.is_empty() { continue; }
            if let Ok(obj) = serde_json::from_str::<serde_json::Value>(&line) {
                if let Some(token) = obj.get("response").and_then(|v| v.as_str()) {
                    full.push_str(token);
                    let _ = app.emit("ollama-token", token.to_string());
                }
            }
        }
    }
    Ok(full)
}

#[tauri::command]
async fn ollama_pull(model: String, app: tauri::AppHandle) -> Result<(), String> {
    use futures_util::StreamExt;
    let client = reqwest::Client::new();
    let res = client
        .post("http://127.0.0.1:11434/api/pull")
        .json(&serde_json::json!({ "name": model, "stream": true }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let mut stream = res.bytes_stream();
    let mut buf = String::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        buf.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(pos) = buf.find('\n') {
            let line = buf[..pos].trim().to_string();
            buf = buf[pos + 1..].to_string();
            if line.is_empty() { continue; }
            if let Ok(obj) = serde_json::from_str::<serde_json::Value>(&line) {
                let status = obj.get("status").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let total = obj.get("total").and_then(|v| v.as_u64()).unwrap_or(0);
                let completed = obj.get("completed").and_then(|v| v.as_u64()).unwrap_or(0);
                let pct = if total > 0 { (completed * 100 / total) as u32 } else { 0 };
                let _ = app.emit("ollama-pull-progress", serde_json::json!({ "status": status, "pct": pct }));
            }
        }
    }
    Ok(())
}

// ── Webhook response classification ──────────────────────────────────────────

fn strip_non_digits(s: &str) -> String {
    s.chars().filter(|c| c.is_ascii_digit()).collect()
}

/// Classifies a raw reply text into a canonical response code.
fn classify_response(raw: &str) -> Option<&'static str> {
    let norm = strip_accents(&raw.to_lowercase());
    let norm = norm.trim();

    // FUP template button responses (exact phrases from the WhatsApp template)
    if norm.contains("nessa") || norm.contains("estou") && norm.contains("sim") {
        return Some("confirmado");
    }
    if norm.contains("quero cancelar") || norm.contains("nao quero") {
        return Some("cancelado");
    }
    // BID / generic responses
    if norm.contains("preciso de ajuda") || norm.contains("preciso ajuda") || norm == "ajuda" || norm == "3" {
        return Some("precisa_ajuda");
    }
    if norm.contains("aceito o app") || norm.contains("aceita o app") || norm.contains("aceito app") {
        return Some("aceita_app");
    }
    if norm.contains("nao aceito") || norm.contains("nao aceita") {
        return Some("nao_aceita_app");
    }
    // Short single-word/number responses
    let words: Vec<&str> = norm
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .collect();
    if words.len() <= 4 {
        let has_sim = words.iter().any(|w| *w == "sim" || *w == "1");
        let has_nao = words.iter().any(|w| *w == "nao" || *w == "2");
        if has_sim && !has_nao { return Some("interesse_sim"); }
        if has_nao && !has_sim { return Some("interesse_nao"); }
    }
    None
}

/// Extracts phone digits from several possible Umbler webhook payload shapes.
fn extract_phone(v: &serde_json::Value) -> Option<String> {
    let candidates = [
        v["from"].as_str(),
        v["data"]["from"].as_str(),
        v["contact"]["phone"].as_str(),
        v["data"]["contact"]["phone"].as_str(),
        v["sender"].as_str(),
        v["phone"].as_str(),
    ];
    for c in candidates.into_iter().flatten() {
        let d = strip_non_digits(c);
        if d.len() >= 10 { return Some(d); }
    }
    None
}

fn extract_body(v: &serde_json::Value) -> Option<String> {
    let candidates = [
        v["body"].as_str(),
        v["text"].as_str(),
        v["data"]["body"].as_str(),
        v["data"]["text"].as_str(),
        v["message"]["body"].as_str(),
        v["message"]["text"].as_str(),
    ];
    for c in candidates.into_iter().flatten() {
        if !c.is_empty() { return Some(c.to_string()); }
    }
    None
}

fn extract_name(v: &serde_json::Value) -> Option<String> {
    let candidates = [
        v["contact"]["name"].as_str(),
        v["data"]["contact"]["name"].as_str(),
        v["contact_name"].as_str(),
        v["data"]["contact_name"].as_str(),
        v["name"].as_str(),
    ];
    for c in candidates.into_iter().flatten() {
        if !c.is_empty() { return Some(c.to_string()); }
    }
    None
}

// ── Webhook HTTP server (axum) ────────────────────────────────────────────────

#[derive(serde::Serialize, Clone)]
struct WebhookResponseEvent {
    tipo: String,
    chapa_nome: String,
    chapa_telefone: Option<String>,
    resposta: String,
    id_tarefa: Option<i64>,
    empresa: Option<String>,
    disparo_id: Option<String>,
    message_body: String,
    received_at: String,
}

async fn process_webhook_response(
    app: std::sync::Arc<tauri::AppHandle>,
    phone_digits: String,
    body: String,
    _name: Option<String>,
) {
    use rusqlite::{Connection, params};
    use tauri::Manager;

    let resposta = match classify_response(&body) {
        Some(r) => r,
        None => {
            log::info!("webhook: unclassified response from {} — body: {}", phone_digits, body);
            return;
        }
    };

    let data_dir = match app.path().app_data_dir() {
        Ok(d) => d,
        Err(_) => return,
    };
    let db_path = data_dir.join("fupmanager.db");
    let conn = match Connection::open(&db_path) {
        Ok(c) => c,
        Err(_) => return,
    };

    let now = chrono_now_iso();
    // Match pattern: phone ends with the stored number or vice-versa
    let phone_pattern = format!("%{}", &phone_digits[phone_digits.len().saturating_sub(11)..]);

    // 1. Try BID first (most recent aguardando dispatch within 7 days)
    let bid: Option<(String, String, String, Option<i64>, Option<String>, Option<String>)> = conn.query_row(
        "SELECT id, chapa_nome, chapa_telefone, id_tarefa, empresa, data_tarefa
         FROM bid_disparos
         WHERE REPLACE(REPLACE(chapa_telefone,'-',''),' ','') LIKE ?1
           AND status = 'aguardando'
           AND data_disparo >= datetime('now','-7 days')
         ORDER BY data_disparo DESC LIMIT 1",
        params![phone_pattern],
        |row| Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<i64>>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, Option<String>>(5)?,
        )),
    ).ok();

    if let Some((disp_id, chapa_nome, chapa_tel, id_tarefa, empresa, data_tarefa)) = bid {
        let _ = conn.execute(
            "UPDATE bid_disparos SET status=?1, data_resposta1=?2 WHERE id=?3",
            params![resposta, now, disp_id],
        );
        let log_id = new_uuid();
        let _ = conn.execute(
            "INSERT OR IGNORE INTO resposta_log (id,tipo,chapa_nome,chapa_telefone,resposta,id_tarefa,empresa,data_tarefa,disparo_id,fonte,message_body,received_at)
             VALUES (?1,'bid',?2,?3,?4,?5,?6,?7,?8,'webhook',?9,?10)",
            params![log_id, chapa_nome, chapa_tel, resposta, id_tarefa, empresa, data_tarefa, disp_id, body, now],
        );
        let _ = app.emit("webhook:response", WebhookResponseEvent {
            tipo: "bid".into(),
            chapa_nome: chapa_nome.clone(),
            chapa_telefone: Some(chapa_tel),
            resposta: resposta.into(),
            id_tarefa,
            empresa,
            disparo_id: Some(disp_id),
            message_body: body,
            received_at: now,
        });
        log::info!("webhook BID match: {} → {}", chapa_nome, resposta);
        return;
    }

    // 2. Try FUP (chapas with umbler_talk canal, not yet confirmed/removed)
    let fup: Option<(String, String, Option<String>, i64, String)> = conn.query_row(
        "SELECT c.id, c.nome_chapa, c.telefone_chapa, c.id_tarefa, t.empresa
         FROM chapas c
         JOIN tarefas t ON c.id_tarefa = t.id_tarefa
         WHERE REPLACE(REPLACE(COALESCE(c.telefone_chapa,''),'-',''),' ','') LIKE ?1
           AND t.ativo = 1
           AND c.canal_contato = 'umbler_talk'
           AND c.status_contato NOT IN ('confirmado','removido')
         ORDER BY c.data_contato DESC LIMIT 1",
        params![phone_pattern],
        |row| Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, i64>(3)?,
            row.get::<_, String>(4)?,
        )),
    ).ok();

    if let Some((chapa_id, chapa_nome, chapa_tel, id_tarefa, empresa)) = fup {
        let fup_resposta = if resposta == "interesse_sim" { "confirmado" } else if resposta == "interesse_nao" { "cancelado" } else { resposta };
        let _ = conn.execute(
            "UPDATE chapas SET status_contato=?1, data_contato=?2 WHERE id=?3",
            params![fup_resposta, now, chapa_id],
        );
        let log_id = new_uuid();
        let _ = conn.execute(
            "INSERT OR IGNORE INTO resposta_log (id,tipo,chapa_nome,chapa_telefone,resposta,id_tarefa,empresa,fonte,message_body,received_at)
             VALUES (?1,'fup',?2,?3,?4,?5,?6,'webhook',?7,?8)",
            params![log_id, chapa_nome, chapa_tel, fup_resposta, id_tarefa, empresa, body, now],
        );
        let _ = app.emit("webhook:response", WebhookResponseEvent {
            tipo: "fup".into(),
            chapa_nome: chapa_nome.clone(),
            chapa_telefone: chapa_tel,
            resposta: fup_resposta.into(),
            id_tarefa: Some(id_tarefa),
            empresa: Some(empresa),
            disparo_id: None,
            message_body: body,
            received_at: now,
        });
        log::info!("webhook FUP match: {} → {}", chapa_nome, fup_resposta);
        return;
    }

    log::info!("webhook: no match found for phone {} (body: {})", phone_digits, body);
}

fn new_uuid() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    format!("{:x}-{:x}", t.as_secs(), t.subsec_nanos())
}

fn chrono_now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // Format as ISO 8601 UTC
    let s = secs % 60;
    let m = (secs / 60) % 60;
    let h = (secs / 3600) % 24;
    let days = secs / 86400;
    // Simple date calculation from epoch
    let mut y = 1970u32;
    let mut rem_days = days;
    loop {
        let dy = if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) { 366 } else { 365 };
        if rem_days < dy { break; }
        rem_days -= dy;
        y += 1;
    }
    let months = [31u64, if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut mo = 1u32;
    for dm in &months {
        if rem_days < *dm { break; }
        rem_days -= dm;
        mo += 1;
    }
    let d = rem_days + 1;
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, mo, d, h, m, s)
}

async fn start_webhook_server(app: tauri::AppHandle, port: u16) {
    use axum::{Router, routing::post, extract::State, body::Bytes, http::StatusCode};
    use std::sync::Arc;

    async fn umbler_handler(
        State(app): State<Arc<tauri::AppHandle>>,
        body: Bytes,
    ) -> (StatusCode, &'static str) {
        let payload: serde_json::Value = match serde_json::from_slice(&body) {
            Ok(v) => v,
            Err(_) => return (StatusCode::BAD_REQUEST, "invalid json"),
        };

        log::info!("webhook received: {}", payload);

        // Skip outbound messages
        let direction = payload["data"]["direction"].as_str()
            .or_else(|| payload["direction"].as_str())
            .unwrap_or("inbound");
        if direction == "outbound" {
            return (StatusCode::OK, "skipped");
        }

        let phone = match extract_phone(&payload) {
            Some(p) => p,
            None => {
                log::warn!("webhook: could not extract phone from payload");
                return (StatusCode::OK, "no_phone");
            }
        };
        let msg_body = match extract_body(&payload) {
            Some(b) => b,
            None => return (StatusCode::OK, "no_body"),
        };
        let name = extract_name(&payload);

        let app_clone = app.clone();
        tauri::async_runtime::spawn(async move {
            process_webhook_response(app_clone, phone, msg_body, name).await;
        });

        (StatusCode::OK, "ok")
    }

    let state = Arc::new(app);
    let router = Router::new()
        .route("/webhook/umbler", post(umbler_handler))
        .with_state(state);

    match tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await {
        Ok(listener) => {
            log::info!("Webhook server listening on 0.0.0.0:{}", port);
            let _ = axum::serve(listener, router).await;
        }
        Err(e) => log::error!("Falha ao abrir porta {} para webhook: {}", port, e),
    }
}

// ── New Tauri commands ────────────────────────────────────────────────────────

#[tauri::command]
fn get_webhook_port() -> u16 { 9988 }

#[derive(serde::Serialize)]
struct RespostaLogRow {
    id: String,
    tipo: String,
    chapa_nome: String,
    chapa_telefone: Option<String>,
    resposta: String,
    id_tarefa: Option<i64>,
    empresa: Option<String>,
    data_tarefa: Option<String>,
    disparo_id: Option<String>,
    fonte: String,
    message_body: Option<String>,
    received_at: String,
}

#[tauri::command]
fn get_resposta_log(
    tipo: Option<String>,
    data_inicio: Option<String>,
    data_fim: Option<String>,
    limit: i64,
    offset: i64,
) -> Result<Vec<RespostaLogRow>, String> {
    use rusqlite::{Connection, params_from_iter};

    // Locate DB path — use app data dir heuristic
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let db_path = if local.is_empty() {
        return Err("LOCALAPPDATA not set".into());
    } else {
        std::path::PathBuf::from(local)
            .join("com.fupmanager.app")
            .join("fupmanager.db")
    };

    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let mut conditions = vec!["1=1".to_string()];
    let mut vals: Vec<Box<dyn rusqlite::ToSql>> = vec![];

    if let Some(t) = tipo {
        conditions.push(format!("tipo = ?{}", vals.len() + 1));
        vals.push(Box::new(t));
    }
    if let Some(di) = data_inicio {
        conditions.push(format!("received_at >= ?{}", vals.len() + 1));
        vals.push(Box::new(di));
    }
    if let Some(df) = data_fim {
        conditions.push(format!("received_at <= ?{}", vals.len() + 1));
        vals.push(Box::new(format!("{}T23:59:59Z", df.trim_end_matches('Z').split('T').next().unwrap_or(&df))));
    }

    let sql = format!(
        "SELECT id,tipo,chapa_nome,chapa_telefone,resposta,id_tarefa,empresa,data_tarefa,disparo_id,fonte,message_body,received_at
         FROM resposta_log WHERE {} ORDER BY received_at DESC LIMIT {} OFFSET {}",
        conditions.join(" AND "), limit, offset
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params_from_iter(vals.iter().map(|v| v.as_ref())), |row| {
        Ok(RespostaLogRow {
            id: row.get(0)?,
            tipo: row.get(1)?,
            chapa_nome: row.get(2)?,
            chapa_telefone: row.get(3)?,
            resposta: row.get(4)?,
            id_tarefa: row.get(5)?,
            empresa: row.get(6)?,
            data_tarefa: row.get(7)?,
            disparo_id: row.get(8)?,
            fonte: row.get(9)?,
            message_body: row.get(10)?,
            received_at: row.get(11)?,
        })
    }).map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let migrations = vec![
    Migration {
      version: 1,
      description: "create_initial_tables",
      sql: "
PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=10000;
CREATE TABLE IF NOT EXISTS tarefas (
  id_tarefa INTEGER PRIMARY KEY,
  data_tarefa TEXT NOT NULL,
  cidade_uf TEXT,
  empresa TEXT NOT NULL,
  cnpj TEXT,
  status_tarefa TEXT NOT NULL DEFAULT 'Em Aberto',
  quantidade_chapas INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1,
  is_overnight INTEGER NOT NULL DEFAULT 0,
  importado_em TEXT,
  observacoes TEXT,
  observacoes_updated_at TEXT,
  validacao_status TEXT NOT NULL DEFAULT 'aguardando',
  data_validacao_recebida TEXT,
  data_upload_meu_chapa TEXT,
  obs_validacao TEXT
);
CREATE TABLE IF NOT EXISTS chapas (
  id TEXT PRIMARY KEY,
  id_tarefa INTEGER NOT NULL,
  nome_chapa TEXT,
  telefone_chapa TEXT,
  cpf TEXT,
  status_contato TEXT NOT NULL DEFAULT 'pendente',
  validacao_presenca TEXT,
  data_validacao TEXT,
  data_contato TEXT,
  canal_contato TEXT,
  data_remocao TEXT,
  motivo_remocao TEXT
);
CREATE TABLE IF NOT EXISTS carteira (
  id TEXT PRIMARY KEY,
  nome_fantasia TEXT NOT NULL UNIQUE,
  cnpj TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE IF NOT EXISTS fup_log (
  id TEXT PRIMARY KEY,
  id_tarefa INTEGER NOT NULL,
  canal TEXT NOT NULL,
  data_disparo TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  observacao TEXT
);
CREATE TABLE IF NOT EXISTS notificacoes_enviadas (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  id_tarefa INTEGER,
  referencia_data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS validacoes_tardias (
  id TEXT PRIMARY KEY,
  id_tarefa_retroativa INTEGER NOT NULL,
  data_tarefa_retroativa TEXT,
  id_tarefa_original INTEGER,
  data_tarefa_original TEXT,
  data_validacao_cliente TEXT NOT NULL,
  motivo TEXT NOT NULL,
  observacao TEXT,
  empresa TEXT,
  registrado_por TEXT,
  chapas_alocados TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_chapas_tarefa ON chapas(id_tarefa);
CREATE INDEX IF NOT EXISTS idx_fup_tarefa ON fup_log(id_tarefa);
CREATE INDEX IF NOT EXISTS idx_notif_tipo ON notificacoes_enviadas(tipo, referencia_data);
",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 2,
      description: "chapa_book_and_agenda",
      sql: "
CREATE TABLE IF NOT EXISTS chapa_book (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  telefone1 TEXT,
  telefone2 TEXT,
  cpf TEXT,
  empresas TEXT,
  grupo TEXT,
  status_chapa TEXT NOT NULL DEFAULT 'ativo',
  observacoes TEXT,
  pedidos TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_chapa_book_nome ON chapa_book(nome);
CREATE TABLE IF NOT EXISTS agenda (
  id TEXT PRIMARY KEY,
  titulo TEXT NOT NULL,
  descricao TEXT,
  prazo TEXT,
  importancia TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'a_fazer',
  vinculo_tipo TEXT,
  vinculo_chapa_nome TEXT,
  vinculo_chapa_tel TEXT,
  vinculo_empresa TEXT,
  vinculo_id_tarefa INTEGER,
  concluido_em TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_agenda_status ON agenda(status);
CREATE INDEX IF NOT EXISTS idx_agenda_prazo ON agenda(prazo);
",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 3,
      description: "carteira_grupo",
      sql: "ALTER TABLE carteira ADD COLUMN grupo TEXT;",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 4,
      description: "cliente_book",
      sql: "
CREATE TABLE IF NOT EXISTS cliente_book (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  cnpj TEXT,
  contato_nome TEXT,
  telefone TEXT,
  email TEXT,
  segmento TEXT,
  status_cliente TEXT NOT NULL DEFAULT 'ativo',
  particularidades TEXT,
  exigencias TEXT,
  pedidos TEXT,
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_cliente_book_nome ON cliente_book(nome);
",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 5,
      description: "fup_log_chapa_id",
      sql: "ALTER TABLE fup_log ADD COLUMN chapa_id TEXT;",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 6,
      description: "lembretes",
      sql: "CREATE TABLE IF NOT EXISTS lembretes (id TEXT PRIMARY KEY, empresa TEXT NOT NULL, mensagem TEXT NOT NULL, minutos_antes INTEGER NOT NULL DEFAULT 60, ativo INTEGER NOT NULL DEFAULT 1, criado_em TEXT NOT NULL);",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 7,
      description: "empresa_config",
      sql: "CREATE TABLE IF NOT EXISTS empresa_config (nome_fantasia TEXT PRIMARY KEY, oculta_dashboard INTEGER NOT NULL DEFAULT 0);",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 8,
      description: "bid_tables_and_client_addresses",
      sql: "
CREATE TABLE IF NOT EXISTS bid_chapas (
  id TEXT PRIMARY KEY,
  id_usuario INTEGER,
  nome TEXT NOT NULL,
  telefone TEXT,
  lat REAL,
  lng REAL,
  cidade TEXT,
  estado TEXT,
  tarefas_finalizadas INTEGER NOT NULL DEFAULT 0,
  usuario_app INTEGER NOT NULL DEFAULT 0,
  verificacao1 TEXT,
  verificacao2 TEXT,
  status_contato_bid TEXT,
  importado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE IF NOT EXISTS bid_disparos (
  id TEXT PRIMARY KEY,
  chapa_nome TEXT NOT NULL,
  chapa_telefone TEXT NOT NULL,
  id_tarefa INTEGER,
  empresa TEXT,
  data_tarefa TEXT,
  params_json TEXT,
  data_disparo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aguardando',
  data_resposta1 TEXT,
  data_resposta2 TEXT
);
CREATE INDEX IF NOT EXISTS idx_bid_chapas_nome ON bid_chapas(nome);
CREATE INDEX IF NOT EXISTS idx_bid_disparos_status ON bid_disparos(status);
ALTER TABLE cliente_book ADD COLUMN enderecos TEXT;
",
      kind: MigrationKind::Up,
    },
    // Migration 9: recovery — recreates bid tables with IF NOT EXISTS in case migration 8
    // failed (its ALTER TABLE rolled back the whole transaction on some databases).
    // The enderecos column is handled in Rust setup via PRAGMA table_info check.
    Migration {
      version: 9,
      description: "bid_tables_recovery",
      sql: "
CREATE TABLE IF NOT EXISTS bid_chapas (
  id TEXT PRIMARY KEY,
  id_usuario INTEGER,
  nome TEXT NOT NULL,
  telefone TEXT,
  lat REAL,
  lng REAL,
  cidade TEXT,
  estado TEXT,
  tarefas_finalizadas INTEGER NOT NULL DEFAULT 0,
  usuario_app INTEGER NOT NULL DEFAULT 0,
  verificacao1 TEXT,
  verificacao2 TEXT,
  status_contato_bid TEXT,
  importado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE IF NOT EXISTS bid_disparos (
  id TEXT PRIMARY KEY,
  chapa_nome TEXT NOT NULL,
  chapa_telefone TEXT NOT NULL,
  id_tarefa INTEGER,
  empresa TEXT,
  data_tarefa TEXT,
  params_json TEXT,
  data_disparo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aguardando',
  data_resposta1 TEXT,
  data_resposta2 TEXT
);
CREATE INDEX IF NOT EXISTS idx_bid_chapas_nome ON bid_chapas(nome);
CREATE INDEX IF NOT EXISTS idx_bid_disparos_status ON bid_disparos(status);
",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 10,
      description: "chapa_registry_and_cep_cache",
      sql: "
CREATE TABLE IF NOT EXISTS chapa_registry (
  cpf TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  telefone TEXT,
  cidade TEXT,
  bairro TEXT,
  estado TEXT,
  rua TEXT,
  cep TEXT,
  numero TEXT,
  tarefas INTEGER NOT NULL DEFAULT 0,
  data_primeira_tarefa TEXT,
  data_ultima_tarefa TEXT,
  situacao TEXT,
  bloqueio TEXT,
  motivo_bloqueio TEXT,
  aso TEXT,
  importado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE IF NOT EXISTS cep_cache (
  cep TEXT PRIMARY KEY,
  lat REAL,
  lng REAL,
  geocodificado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_registry_telefone ON chapa_registry(telefone);
CREATE INDEX IF NOT EXISTS idx_registry_cep ON chapa_registry(cep);
CREATE INDEX IF NOT EXISTS idx_registry_cidade ON chapa_registry(cidade);
",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 11,
      description: "analise_base_tables",
      sql: "
CREATE TABLE IF NOT EXISTS analise_snapshots (
  id TEXT PRIMARY KEY,
  cliente TEXT NOT NULL,
  periodo_inicio TEXT NOT NULL,
  periodo_fim TEXT NOT NULL,
  total_tarefas INTEGER NOT NULL DEFAULT 0,
  total_chapas INTEGER NOT NULL DEFAULT 0,
  configuracoes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE IF NOT EXISTS analise_chapas (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES analise_snapshots(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  telefone TEXT,
  cpf TEXT,
  categoria TEXT NOT NULL,
  score REAL NOT NULL DEFAULT 0,
  total_finalizado INTEGER NOT NULL DEFAULT 0,
  total_cancelado INTEGER NOT NULL DEFAULT 0,
  recencia_dias INTEGER,
  frequencia_semanal REAL,
  fill_rate_individual REAL,
  turno_perfil TEXT,
  tendencia TEXT,
  metricas_json TEXT
);
CREATE TABLE IF NOT EXISTS analise_anotacoes (
  id TEXT PRIMARY KEY,
  chapa_nome TEXT NOT NULL,
  snapshot_id TEXT NOT NULL REFERENCES analise_snapshots(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE IF NOT EXISTS analise_config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analise_chapas_snapshot ON analise_chapas(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_analise_chapas_categoria ON analise_chapas(categoria);
CREATE INDEX IF NOT EXISTS idx_analise_anotacoes_snapshot ON analise_anotacoes(snapshot_id);
",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 12,
      description: "analise_flags_ai_leo_tables",
      sql: "
CREATE TABLE IF NOT EXISTS analise_flags (
  id TEXT PRIMARY KEY,
  chapa_nome TEXT NOT NULL,
  empresa TEXT NOT NULL,
  flag TEXT NOT NULL,
  nota TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_flags_chapa ON analise_flags(chapa_nome, empresa);

CREATE TABLE IF NOT EXISTS analise_ai_cache (
  id TEXT PRIMARY KEY,
  ancora TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  output_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_cache ON analise_ai_cache(ancora, input_hash);

CREATE TABLE IF NOT EXISTS leo_config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leo_cache (
  numero TEXT PRIMARY KEY,
  total_ofertas INTEGER NOT NULL DEFAULT 0,
  total_sim INTEGER NOT NULL DEFAULT 0,
  pct_sim REAL NOT NULL DEFAULT 0,
  passa_75pct INTEGER NOT NULL DEFAULT 0,
  repete INTEGER NOT NULL DEFAULT 0,
  atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS analise_chapas_nome_norm (
  snapshot_id TEXT NOT NULL,
  nome_norm TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, nome_norm),
  FOREIGN KEY (snapshot_id) REFERENCES analise_snapshots(id) ON DELETE CASCADE
);
",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 13,
      description: "resposta_log",
      sql: "
CREATE TABLE IF NOT EXISTS resposta_log (
  id             TEXT PRIMARY KEY,
  tipo           TEXT NOT NULL,
  chapa_nome     TEXT NOT NULL,
  chapa_telefone TEXT,
  resposta       TEXT NOT NULL,
  id_tarefa      INTEGER,
  empresa        TEXT,
  data_tarefa    TEXT,
  disparo_id     TEXT,
  fonte          TEXT NOT NULL DEFAULT 'webhook',
  message_body   TEXT,
  received_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_resposta_log_received ON resposta_log(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_resposta_log_tipo ON resposta_log(tipo);
CREATE INDEX IF NOT EXISTS idx_resposta_log_tarefa ON resposta_log(id_tarefa);
",
      kind: MigrationKind::Up,
    },
  ];

  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![check_notification_responses, backup_database, export_db_base64, import_db_base64, check_bid_responses, start_ollama, stop_ollama, check_ollama, ollama_generate, ollama_pull, get_webhook_port, get_resposta_log])
    .plugin(
      tauri_plugin_sql::Builder::default()
        .add_migrations("sqlite:fupmanager.db", migrations)
        .build(),
    )
    .plugin(tauri_plugin_opener::init())
    .setup(|app| {
      // Add enderecos column to cliente_book if missing (recovery from failed migration 8).
      // Uses a separate rusqlite connection so it works regardless of the plugin pool state.
      {
        use rusqlite::Connection;
        use tauri::Manager;
        if let Ok(data_dir) = app.path().app_data_dir() {
          let db_path = data_dir.join("fupmanager.db");
          if let Ok(conn) = Connection::open(&db_path) {
            let has_col: bool = conn.query_row(
              "SELECT COUNT(*) FROM pragma_table_info('cliente_book') WHERE name='enderecos'",
              [],
              |row| row.get::<_, i64>(0),
            ).map(|n| n > 0).unwrap_or(false);
            if !has_col {
              let _ = conn.execute("ALTER TABLE cliente_book ADD COLUMN enderecos TEXT", []);
            }
          }
        }
      }

      // Start webhook HTTP server on port 9988
      {
        let app_handle = app.handle().clone();
        tauri::async_runtime::spawn(async move {
          start_webhook_server(app_handle, 9988).await;
        });
      }

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
