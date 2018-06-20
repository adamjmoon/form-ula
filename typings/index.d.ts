import * as React from 'react'

type Callback = () => void

export interface FormState<Item> {
  fields: Array<Field> | null
  isEditable: boolean
}

export enum StateChangeTypes {
  clickField = '__form_click_item__',
  blurInput = '__form_blur_input__',
  changeInput = '__form_change_input__',
  keyDownSpaceButton = '__form_keydown_space_button__',
  clickButton = '__form_click_button__',
  blurButton = '__form_blur_button__',
  controlledPropUpdatedSelectedItem = '__form_controlled_prop_updated_selected_item__',
}

export interface FormState<Item> {
  defaultSelectedItem?: Item
  defaultHighlightedIndex?: number | null
  defaultInputValue?: string
  defaultIsOpen?: boolean
  itemToString?: (item: Item) => string
  onChange?: (
    selectedItem: Item,
    stateAndHelpers: ControllerStateAndHelpers<Item>,
  ) => void
  onSelect?: (
    selectedItem: Item,
    stateAndHelpers: ControllerStateAndHelpers<Item>,
  ) => void
  onStateChange?: (
    options: StateChangeOptions<Item>,
    stateAndHelpers: ControllerStateAndHelpers<Item>,
  ) => void
  onInputValueChange?: (
    inputValue: string,
    stateAndHelpers: ControllerStateAndHelpers<Item>,
  ) => void
  stateReducer?: (
    state: DownshiftState<Item>,
    changes: StateChangeOptions<Item>,
  ) => Partial<StateChangeOptions<Item>>
  itemCount?: number
  highlightedIndex?: number | null
  inputValue?: string | null
  isOpen?: boolean
  selectedItem?: Item | null
  children?: ChildrenFunction<Item>
  id?: string
  environment?: Environment
  onOuterClick?: () => void
  onUserAction?: (
    options: StateChangeOptions<Item>,
    stateAndHelpers: ControllerStateAndHelpers<Item>,
  ) => void
}

export interface Environment {
  addEventListener: typeof window.addEventListener
  removeEventListener: typeof window.removeEventListener
  document: Document
}

export interface GetFormPropsOptions {
  refKey: string
}

export interface PropGetters<Item> {
  getFormProps: (options: GetFormPropsOptions) => any
}

export interface Actions<Item> {
  reset: (
    otherStateToSet?: Partial<StateChangeOptions<Item>>,
    cb?: Callback,
  ) => void  
  setState: (
    stateToSet: Partial<StateChangeOptions<Item>> | StateChangeFunction<Item>,
    cb?: Callback,
  ) => void
  // props
  itemToString: (item: Item) => string
}

export type ControllerStateAndHelpers<Item> = DownshiftState<Item> &
  PropGetters<Item> &
  Actions<Item>

export type ChildrenFunction<Item> = (
  options: ControllerStateAndHelpers<Item>,
) => React.ReactNode

export type FormulaInterface<Item> = React.ComponentClass<
  FormState<Item>
> & {
  stateChangeTypes: {
    unknown: StateChangeTypes.unknown
    mouseUp: StateChangeTypes.mouseUp
    itemMouseEnter: StateChangeTypes.itemMouseEnter
    keyDownArrowUp: StateChangeTypes.keyDownArrowUp
    keyDownArrowDown: StateChangeTypes.keyDownArrowDown
    keyDownEscape: StateChangeTypes.keyDownEscape
    keyDownEnter: StateChangeTypes.keyDownEnter
    clickItem: StateChangeTypes.clickItem
    blurInput: StateChangeTypes.blurInput
    changeInput: StateChangeTypes.changeInput
    keyDownSpaceButton: StateChangeTypes.keyDownSpaceButton
    clickButton: StateChangeTypes.clickButton
    blurButton: StateChangeTypes.blurButton
    controlledPropUpdatedSelectedItem: StateChangeTypes.controlledPropUpdatedSelectedItem
  }
}

declare const Formula: FormulaInterface<any>
export default Formula
