// On its own, without the signals: the browser runtime runs event listeners
// in a batch, and an island that uses no signals shouldn't load them.

let depth = 0;
let end: (() => void) | undefined;

/** Whether a batch is running. */
export function batching(): boolean {
  return depth > 0;
}

/** Calls `callback` when the running batch ends, in place of an earlier one. */
export function onBatchEnd(callback: () => void): void {
  end = callback;
}

/**
 * Runs `callback` and notifies about the signals it sets once it returns,
 * together: a computed, an effect or a component that reads several of
 * them runs once, and a signal set back to its value doesn't notify.
 * Batches nest: the outermost one notifies. Event listeners of elements
 * run in a batch.
 *
 * Values are current inside the batch: a signal has the value it was set
 * to, and a computed signal read after it its new value. Only the
 * synchronous part of `callback` is batched, not what follows an `await`.
 */
export function batch<T>(callback: () => T): T {
  depth++;
  let result: T;
  try {
    result = callback();
  } catch (error) {
    // The signals are set: what reads them is notified all the same.
    try {
      endBatch();
    } catch (notifyError) {
      throw new AggregateError([error, notifyError], "Batch and signal subscribers failed");
    }
    throw error;
  }
  endBatch();
  return result;
}

function endBatch(): void {
  if (--depth) return;
  const callback = end;
  // Before it runs: a subscriber may start a batch of its own.
  end = undefined;
  callback?.();
}
