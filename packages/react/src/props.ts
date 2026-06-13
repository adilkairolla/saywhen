import type * as React from "react";
import type {
  ControllerState,
  DateInputController,
  KeyName,
} from "@saywhen/core/controller";

export interface DateInputIds {
  input: string;
  listbox: string;
  option: (index: number) => string;
}

export interface InputProps {
  id: string;
  role: "combobox";
  "aria-expanded": boolean;
  "aria-controls": string;
  "aria-autocomplete": "list";
  "aria-haspopup": "listbox";
  "aria-activedescendant"?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export interface ListboxProps {
  id: string;
  role: "listbox";
}

export interface OptionProps {
  id: string;
  role: "option";
  "aria-selected": boolean;
  onMouseDown: (e: { preventDefault: () => void }) => void;
}

export interface GhostProps {
  "aria-hidden": true;
  children: string;
}

const KEYS = new Set<KeyName>(["ArrowDown", "ArrowUp", "Tab", "Enter", "Escape"]);

export function makeInputProps(
  state: ControllerState,
  controller: DateInputController,
  ids: DateInputIds,
): InputProps {
  const active = state.isOpen && state.activeSuggestionIndex >= 0;
  return {
    id: ids.input,
    role: "combobox",
    "aria-expanded": state.isOpen,
    "aria-controls": ids.listbox,
    "aria-autocomplete": "list",
    "aria-haspopup": "listbox",
    ...(active ? { "aria-activedescendant": ids.option(state.activeSuggestionIndex) } : {}),
    value: state.rawInput,
    onChange: (e) => controller.setInput(e.target.value),
    onKeyDown: (e) => {
      if (!KEYS.has(e.key as KeyName)) return;
      if (controller.keymap(e.key as KeyName)) e.preventDefault();
    },
  };
}

export function makeListboxProps(ids: DateInputIds): ListboxProps {
  return { id: ids.listbox, role: "listbox" };
}

export function makeOptionProps(
  state: ControllerState,
  controller: DateInputController,
  ids: DateInputIds,
  index: number,
): OptionProps {
  return {
    id: ids.option(index),
    role: "option",
    "aria-selected": index === state.activeSuggestionIndex,
    onMouseDown: (e) => {
      e.preventDefault(); // keep focus on the input; beat the blur/commit
      controller.acceptSuggestion(index);
    },
  };
}

export function makeGhostProps(state: ControllerState): GhostProps {
  return { "aria-hidden": true, children: state.ghostText };
}
