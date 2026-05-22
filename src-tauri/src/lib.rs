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
  ];

  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![check_notification_responses, backup_database, check_bid_responses])
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
