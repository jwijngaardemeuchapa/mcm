import { useEffect, useState } from "react";
import { dispatchQueue, type MassFupState, type TaskCancelState, type ChapaJobState } from "./dispatchQueue";

export function useMassFupState(taskId: number): MassFupState {
  const [state, setState] = useState<MassFupState>(() => dispatchQueue.getMassFupState(taskId));
  useEffect(() => dispatchQueue.subscribeMassFup(taskId, setState), [taskId]);
  return state;
}

export function useTaskCancelState(taskId: number): TaskCancelState {
  const [state, setState] = useState<TaskCancelState>(() => dispatchQueue.getTaskCancelState(taskId));
  useEffect(() => dispatchQueue.subscribeTaskCancel(taskId, setState), [taskId]);
  return state;
}

export function useChapaJobState(chapaId: string): ChapaJobState {
  const [state, setState] = useState<ChapaJobState>(() => dispatchQueue.getChapaJobState(chapaId));
  useEffect(() => dispatchQueue.subscribeChapaJob(chapaId, setState), [chapaId]);
  return state;
}
