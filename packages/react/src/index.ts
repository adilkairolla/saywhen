import { useCallback, useEffect, useId, useMemo, useRef, useSyncExternalStore } from "react";
import {
  createDateInputController,
  type ControllerContextPatch,
  type ControllerOptions,
  type ControllerState,
  type DateInputController,
} from "@saywhen/core/controller";
import {
  makeGhostProps,
  makeInputProps,
  makeListboxProps,
  makeOptionProps,
  type DateInputIds,
  type GhostProps,
  type InputProps,
  type ListboxProps,
  type OptionProps,
} from "./props.js";

export * from "./props.js";
export type { ControllerOptions, ControllerState, DateInputController };

export interface UseDateInput {
  state: ControllerState;
  controller: DateInputController;
  getInputProps(): InputProps;
  getListboxProps(): ListboxProps;
  getOptionProps(index: number): OptionProps;
  getGhostProps(): GhostProps;
}

export function useDateInput(options: ControllerOptions): UseDateInput {
  const ref = useRef<DateInputController | null>(null);
  if (ref.current === null) ref.current = createDateInputController(options);
  const controller = ref.current;

  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);

  const baseId = useId();
  const ids = useMemo<DateInputIds>(
    () => ({
      input: `${baseId}-input`,
      listbox: `${baseId}-listbox`,
      option: (i: number) => `${baseId}-option-${i}`,
    }),
    [baseId],
  );

  // keep live context fields in sync; swapping the engine requires a remount (use a React key)
  const { timeZone, allowPast, enableTime, weekStart, dateOrder } = options;
  useEffect(() => {
    const patch: ControllerContextPatch = { timeZone };
    if (allowPast !== undefined) patch.allowPast = allowPast;
    if (enableTime !== undefined) patch.enableTime = enableTime;
    if (weekStart !== undefined) patch.weekStart = weekStart;
    if (dateOrder !== undefined) patch.dateOrder = dateOrder;
    controller.setContext(patch);
  }, [controller, timeZone, allowPast, enableTime, weekStart, dateOrder]);

  return {
    state,
    controller,
    getInputProps: useCallback(() => makeInputProps(state, controller, ids), [state, controller, ids]),
    getListboxProps: useCallback(() => makeListboxProps(ids), [ids]),
    getOptionProps: useCallback(
      (i: number) => makeOptionProps(state, controller, ids, i),
      [state, controller, ids],
    ),
    getGhostProps: useCallback(() => makeGhostProps(state), [state]),
  };
}
