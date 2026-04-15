export type TransferStateItem =
  | TransferState
  | string
  | number
  | boolean
  | null;

export interface TransferState {
  [key: string]: TransferStateItem;
}
