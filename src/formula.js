/* eslint camelcase:0 */

import React, {Component} from 'react'
import PropTypes from 'prop-types'
import preval from 'preval.macro'
import setA11yStatus from './set-a11y-status'
import {
  cbToCb,
  callAll,
  callAllEventHandlers,
  debounce,
  scrollIntoView,
  generateId,
  getA11yStatusMessage,
  unwrapArray,
  isDOMElement,
  isOrContainsNode,
  getElementProps,
  noop,
  requiredProp,
  pickState,
  isPlainObject,
  normalizeArrowKey,
} from './utils'

class Formula extends Component {
  static propTypes = {
    children: PropTypes.func,
    defaultHighlightedIndex: PropTypes.number,
    defaultSelectedItem: PropTypes.any,
    defaultInputValue: PropTypes.string,
    defaultIsOpen: PropTypes.bool,
    getA11yStatusMessage: PropTypes.func,
    itemToString: PropTypes.func,
    onChange: PropTypes.func,
    onSelect: PropTypes.func,
    onStateChange: PropTypes.func,
    onInputValueChange: PropTypes.func,
    onUserAction: PropTypes.func,
    onOuterClick: PropTypes.func,
    selectedItemChanged: PropTypes.func,
    stateReducer: PropTypes.func,
    itemCount: PropTypes.number,
    id: PropTypes.string,
    environment: PropTypes.shape({
      addEventListener: PropTypes.func,
      removeEventListener: PropTypes.func,
      document: PropTypes.shape({
        getElementById: PropTypes.func,
        activeElement: PropTypes.any,
        body: PropTypes.any,
      }),
    }),
    // things we keep in state for uncontrolled components
    // but can accept as props for controlled components
    /* eslint-disable react/no-unused-prop-types */
    selectedItem: PropTypes.any,
    isOpen: PropTypes.bool,
    inputValue: PropTypes.string,
    highlightedIndex: PropTypes.number,
    labelId: PropTypes.string,
    inputId: PropTypes.string,
    menuId: PropTypes.string,
    getItemId: PropTypes.func,
    /* eslint-enable */
  }

  static defaultProps = {
    defaultHighlightedIndex: null,
    defaultSelectedItem: null,
    defaultInputValue: '',
    defaultIsOpen: false,
    getA11yStatusMessage,
    itemToString: i => {
      if (i == null) {
        return ''
      }
      if (process.env.NODE_ENV !== 'production' && isPlainObject(i)) {
        //eslint-disable-next-line no-console
        console.warn(
          'downshift: An object was passed to the default implementation of `itemToString`. You should probably provide your own `itemToString` implementation. Please refer to the `itemToString` API documentation.',
          'The object that was passed:',
          i,
        )
      }
      return String(i)
    },
    onStateChange: () => {},
    onInputValueChange: () => {},
    onUserAction: () => {},
    onChange: () => {},
    onSelect: () => {},
    onOuterClick: () => {},
    selectedItemChanged: (prevItem, item) => prevItem !== item,
    environment:
      typeof window === 'undefined' /* istanbul ignore next (ssr) */
        ? {}
        : window,
    stateReducer: (state, stateToSet) => stateToSet,
  }

  static stateChangeTypes = {
    unknown: '__form_unknown__',
    mouseUp: '__form_mouseup__',
    itemMouseEnter: '__form_item_mouseenter__',
    keyDownArrowUp: '__form_keydown_arrow_up__',
    keyDownArrowDown: '__form_keydown_arrow_down__',
    keyDownEscape: '__form_keydown_escape__',
    keyDownEnter: '__form_keydown_enter__',
    clickItem: '__form_click_item__',
    blurInput: '__form_blur_input__',
    changeInput: '__form_change_input__',
    keyDownSpaceButton: '__form_keydown_space_button__',
    clickButton: '__form_click_button__',
    blurButton: '__form_blur_button__',
    controlledPropUpdatedSelectedItem:
      '__form_controlled_prop_updated_selected_item__',
    touchStart: '__form_touchstart__',
  }

  constructor(...args) {
    super(...args)
    const state = this.getState({
      highlightedIndex: this.props.defaultHighlightedIndex,
      isOpen: this.props.defaultIsOpen,
      inputValue: this.props.defaultInputValue,
      selectedItem: this.props.defaultSelectedItem,
    })
    if (state.selectedItem != null) {
      state.inputValue = this.props.itemToString(state.selectedItem)
    }
    this.state = state
  }

  id = this.props.id || `downshift-${generateId()}`
  menuId = this.props.menuId || `${this.id}-menu`
  labelId = this.props.labelId || `${this.id}-label`
  inputId = this.props.inputId || `${this.id}-input`
  getItemId = this.props.getItemId || (index => `${this.id}-item-${index}`)

  input = null
  items = []
  // itemCount can be changed asynchronously
  // from within downshift (so it can't come from a prop)
  // this is why we store it as an instance and use
  // getItemCount rather than just use items.length
  // (to support windowing + async)
  itemCount = null
  previousResultCount = 0

  /**
   * Gets the state based on internal state or props
   * If a state value is passed via props, then that
   * is the value given, otherwise it's retrieved from
   * stateToMerge
   *
   * This will perform a shallow merge of the given state object
   * with the state coming from props
   * (for the controlled component scenario)
   * This is used in state updater functions so they're referencing
   * the right state regardless of where it comes from.
   *
   * @param {Object} stateToMerge defaults to this.state
   * @return {Object} the state
   */
  getState(stateToMerge = this.state) {
    return Object.keys(stateToMerge).reduce((state, key) => {
      state[key] = this.isControlledProp(key)
        ? this.props[key]
        : stateToMerge[key]
      return state
    }, {})
  }

  /**
   * This determines whether a prop is a "controlled prop" meaning it is
   * state which is controlled by the outside of this component rather
   * than within this component.
   * @param {String} key the key to check
   * @return {Boolean} whether it is a controlled controlled prop
   */
  isControlledProp(key) {
    return this.props[key] !== undefined
  }

  getItemCount() {
    // things read better this way. They're in priority order:
    // 1. `this.itemCount`
    // 2. `this.props.itemCount`
    // 3. `this.items.length`
    /* eslint-disable no-negated-condition */
    if (this.itemCount != null) {
      return this.itemCount
    } else if (this.props.itemCount !== undefined) {
      return this.props.itemCount
    } else {
      return this.items.length
    }
    /* eslint-enable no-negated-condition */
  }

  setItemCount = count => (this.itemCount = count)
  unsetItemCount = () => (this.itemCount = null)

  getItemNodeFromIndex(index) {
    return this.props.environment.document.getElementById(this.getItemId(index))
  }

  setHighlightedIndex = (
    highlightedIndex = this.props.defaultHighlightedIndex,
    otherStateToSet = {},
  ) => {
    otherStateToSet = pickState(otherStateToSet)
    this.internalSetState({highlightedIndex, ...otherStateToSet})
  }

  scrollHighlightedItemIntoView() {
    /* istanbul ignore else (react-native) */
    if (preval`module.exports = process.env.BUILD_REACT_NATIVE !== 'true'`) {
      const node = this.getItemNodeFromIndex(this.getState().highlightedIndex)
      scrollIntoView(node, this._rootNode)
    }
  }

  moveHighlightedIndex(amount, otherStateToSet) {
    if (this.getState().isOpen) {
      this.changeHighlightedIndex(amount, otherStateToSet)
    } else {
      this.setHighlightedIndex(undefined, {isOpen: true, ...otherStateToSet})
    }
  }

  // eslint-disable-next-line complexity
  changeHighlightedIndex(moveAmount, otherStateToSet) {
    const itemsLastIndex = this.getItemCount() - 1
    if (itemsLastIndex < 0) {
      return
    }
    const {highlightedIndex} = this.getState()
    let baseIndex = highlightedIndex
    if (baseIndex === null) {
      baseIndex = moveAmount > 0 ? -1 : itemsLastIndex + 1
    }
    let newIndex = baseIndex + moveAmount
    if (newIndex < 0) {
      newIndex = itemsLastIndex
    } else if (newIndex > itemsLastIndex) {
      newIndex = 0
    }
    this.setHighlightedIndex(newIndex, otherStateToSet)
  }

  clearSelection = cb => {
    this.internalSetState(
      {
        selectedItem: null,
        inputValue: '',
        isOpen: false,
      },
      cb,
    )
  }

  selectItem = (item, otherStateToSet, cb) => {
    otherStateToSet = pickState(otherStateToSet)
    this.internalSetState(
      {
        isOpen: false,
        highlightedIndex: this.props.defaultHighlightedIndex,
        selectedItem: item,
        inputValue: this.isControlledProp('selectedItem')
          ? this.props.defaultInputValue
          : this.props.itemToString(item),
        ...otherStateToSet,
      },
      cb,
    )
  }

  selectItemAtIndex = (itemIndex, otherStateToSet, cb) => {
    const item = this.items[itemIndex]
    if (item == null) {
      return
    }
    this.selectItem(item, otherStateToSet, cb)
  }

  selectHighlightedItem = (otherStateToSet, cb) => {
    return this.selectItemAtIndex(
      this.getState().highlightedIndex,
      otherStateToSet,
      cb,
    )
  }

  // any piece of our state can live in two places:
  // 1. Uncontrolled: it's internal (this.state)
  //    We will call this.setState to update that state
  // 2. Controlled: it's external (this.props)
  //    We will call this.props.onStateChange to update that state
  //
  // In addition, we'll call this.props.onChange if the
  // selectedItem is changed.
  internalSetState = (stateToSet, cb) => {
    let isItemSelected, onChangeArg

    const onStateChangeArg = {}
    const isStateToSetFunction = typeof stateToSet === 'function'

    // we want to call `onInputValueChange` before the `setState` call
    // so someone controlling the `inputValue` state gets notified of
    // the input change as soon as possible. This avoids issues with
    // preserving the cursor position.
    // See https://github.com/paypal/downshift/issues/217 for more info.
    if (!isStateToSetFunction && stateToSet.hasOwnProperty('inputValue')) {
      this.props.onInputValueChange(stateToSet.inputValue, {
        ...this.getStateAndHelpers(),
        ...stateToSet,
      })
    }
    return this.setState(
      state => {
        state = this.getState(state)
        let newStateToSet = isStateToSetFunction
          ? stateToSet(state)
          : stateToSet

        // Your own function that could modify the state that will be set.
        newStateToSet = this.props.stateReducer(state, newStateToSet)

        // checks if an item is selected, regardless of if it's different from
        // what was selected before
        // used to determine if onSelect and onChange callbacks should be called
        isItemSelected = newStateToSet.hasOwnProperty('selectedItem')
        // this keeps track of the object we want to call with setState
        const nextState = {}
        // this is just used to tell whether the state changed
        const nextFullState = {}
        // we need to call on change if the outside world is controlling any of our state
        // and we're trying to update that state. OR if the selection has changed and we're
        // trying to update the selection
        if (
          isItemSelected &&
          newStateToSet.selectedItem !== state.selectedItem
        ) {
          onChangeArg = newStateToSet.selectedItem
        }
        newStateToSet.type =
          newStateToSet.type || Downshift.stateChangeTypes.unknown

        Object.keys(newStateToSet).forEach(key => {
          // onStateChangeArg should only have the state that is
          // actually changing
          if (state[key] !== newStateToSet[key]) {
            onStateChangeArg[key] = newStateToSet[key]
          }
          // the type is useful for the onStateChangeArg
          // but we don't actually want to set it in internal state.
          // this is an undocumented feature for now... Not all internalSetState
          // calls support it and I'm not certain we want them to yet.
          // But it enables users controlling the isOpen state to know when
          // the isOpen state changes due to mouseup events which is quite handy.
          if (key === 'type') {
            return
          }
          nextFullState[key] = newStateToSet[key]
          // if it's coming from props, then we don't care to set it internally
          if (!this.isControlledProp(key)) {
            nextState[key] = newStateToSet[key]
          }
        })

        // if stateToSet is a function, then we weren't able to call onInputValueChange
        // earlier, so we'll call it now that we know what the inputValue state will be.
        if (
          isStateToSetFunction &&
          newStateToSet.hasOwnProperty('inputValue')
        ) {
          this.props.onInputValueChange(newStateToSet.inputValue, {
            ...this.getStateAndHelpers(),
            ...newStateToSet,
          })
        }

        return nextState
      },
      () => {
        // call the provided callback if it's a function
        cbToCb(cb)()

        // only call the onStateChange and onChange callbacks if
        // we have relevant information to pass them.
        const hasMoreStateThanType = Object.keys(onStateChangeArg).length > 1
        if (hasMoreStateThanType) {
          this.props.onStateChange(onStateChangeArg, this.getStateAndHelpers())
        }

        if (isItemSelected) {
          this.props.onSelect(
            stateToSet.selectedItem,
            this.getStateAndHelpers(),
          )
        }

        if (onChangeArg !== undefined) {
          this.props.onChange(onChangeArg, this.getStateAndHelpers())
        }
        // this is currently undocumented and therefore subject to change
        // We'll try to not break it, but just be warned.
        this.props.onUserAction(onStateChangeArg, this.getStateAndHelpers())
      },
    )
  }

  getStateAndHelpers() {
    const {highlightedIndex, inputValue, selectedItem, isOpen} = this.getState()
    const {itemToString} = this.props
    const {id} = this
    const {
      getRootProps,
      getToggleButtonProps,
      getLabelProps,
      getMenuProps,
      getInputProps,
      getItemProps,
      openMenu,
      closeMenu,
      toggleMenu,
      selectItem,
      selectItemAtIndex,
      selectHighlightedItem,
      setHighlightedIndex,
      clearSelection,
      clearItems,
      reset,
      setItemCount,
      unsetItemCount,
      internalSetState: setState,
    } = this
    return {
      // prop getters
      getRootProps,
      getToggleButtonProps,
      getLabelProps,
      getMenuProps,
      getInputProps,
      getItemProps,

      // actions
      reset,
      openMenu,
      closeMenu,
      toggleMenu,
      selectItem,
      selectItemAtIndex,
      selectHighlightedItem,
      setHighlightedIndex,
      clearSelection,
      clearItems,
      setItemCount,
      unsetItemCount,
      setState,

      //props
      itemToString,

      //derived
      id,

      // state
      highlightedIndex,
      inputValue,
      isOpen,
      selectedItem,
    }
  }

  //////////////////////////// ROOT

  rootRef = node => (this._rootNode = node)

  getRootProps = (
    {refKey = 'ref', ...rest} = {},
    {suppressRefError = false} = {},
  ) => {
    // this is used in the render to know whether the user has called getRootProps.
    // It uses that to know whether to apply the props automatically
    this.getRootProps.called = true
    this.getRootProps.refKey = refKey
    this.getRootProps.suppressRefError = suppressRefError
    const {isOpen} = this.getState()
    return {
      [refKey]: this.rootRef,
      role: 'combobox',
      'aria-expanded': isOpen,
      'aria-haspopup': 'listbox',
      'aria-owns': isOpen ? this.menuId : null,
      'aria-labelledby': this.labelId,
      ...rest,
    }
  }

  //\\\\\\\\\\\\\\\\\\\\\\\\\\ ROOT

  keyDownHandlers = {
    ArrowDown(event) {
      event.preventDefault()
      const amount = event.shiftKey ? 5 : 1
      this.moveHighlightedIndex(amount, {
        type: Downshift.stateChangeTypes.keyDownArrowDown,
      })
    },

    ArrowUp(event) {
      event.preventDefault()
      const amount = event.shiftKey ? -5 : -1
      this.moveHighlightedIndex(amount, {
        type: Downshift.stateChangeTypes.keyDownArrowUp,
      })
    },

    Enter(event) {
      if (this.getState().isOpen) {
        event.preventDefault()
        const itemIndex = this.getState().highlightedIndex
        const item = this.items[itemIndex]
        const itemNode = this.getItemNodeFromIndex(itemIndex)
        if (item == null || (itemNode && itemNode.hasAttribute('disabled'))) {
          return
        }
        this.selectHighlightedItem({
          type: Downshift.stateChangeTypes.keyDownEnter,
        })
      }
    },

    Escape(event) {
      event.preventDefault()
      this.reset({type: Downshift.stateChangeTypes.keyDownEscape})
    },
  }

  //////////////////////////// BUTTON

  buttonKeyDownHandlers = {
    ...this.keyDownHandlers,

    ' '(event) {
      event.preventDefault()
      this.toggleMenu({type: Downshift.stateChangeTypes.keyDownSpaceButton})
    },
  }

  getToggleButtonProps = ({
    onClick,
    onPress,
    onKeyDown,
    onBlur,
    ...rest
  } = {}) => {
    const {isOpen} = this.getState()
    const enabledEventHandlers = preval`module.exports = process.env.BUILD_REACT_NATIVE === 'true'`
      ? /* istanbul ignore next (react-native) */
        {
          onPress: callAllEventHandlers(onPress, this.button_handleClick),
        }
      : {
          onClick: callAllEventHandlers(onClick, this.button_handleClick),
          onKeyDown: callAllEventHandlers(onKeyDown, this.button_handleKeyDown),
          onBlur: callAllEventHandlers(onBlur, this.button_handleBlur),
        }
    const eventHandlers = rest.disabled ? {} : enabledEventHandlers
    return {
      type: 'button',
      role: 'button',
      'aria-label': isOpen ? 'close menu' : 'open menu',
      'aria-haspopup': true,
      'data-toggle': true,
      ...eventHandlers,
      ...rest,
    }
  }

  button_handleKeyDown = event => {
    const key = normalizeArrowKey(event)
    if (this.buttonKeyDownHandlers[key]) {
      this.buttonKeyDownHandlers[key].call(this, event)
    }
  }

  button_handleClick = event => {
    event.preventDefault()
    // handle odd case for Safari and Firefox which
    // don't give the button the focus properly.
    /* istanbul ignore if (can't reasonably test this) */
    if (
      this.props.environment.document.activeElement ===
      this.props.environment.document.body
    ) {
      event.target.focus()
    }
    // to simplify testing components that use downshift, we'll not wrap this in a setTimeout
    // if the NODE_ENV is test. With the proper build system, this should be dead code eliminated
    // when building for production and should therefore have no impact on production code.
    if (process.env.NODE_ENV === 'test') {
      this.toggleMenu({type: Downshift.stateChangeTypes.clickButton})
    } else {
      // Ensure that toggle of menu occurs after the potential blur event in iOS
      setTimeout(() =>
        this.toggleMenu({type: Downshift.stateChangeTypes.clickButton}),
      )
    }
  }

  button_handleBlur = event => {
    const blurTarget = event.target // Save blur target for comparison with activeElement later
    // Need setTimeout, so that when the user presses Tab, the activeElement is the next focused element, not body element
    setTimeout(() => {
      if (
        !this.isMouseDown &&
        (this.props.environment.document.activeElement == null ||
          this.props.environment.document.activeElement.id !== this.inputId) &&
        this.props.environment.document.activeElement !== blurTarget // Do nothing if we refocus the same element again (to solve issue in Safari on iOS)
      ) {
        this.reset({type: Downshift.stateChangeTypes.blurButton})
      }
    })
  }

  //\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ BUTTON

  /////////////////////////////// LABEL

  getLabelProps = props => {
    return {htmlFor: this.inputId, id: this.labelId, ...props}
  }

  //\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ LABEL

  /////////////////////////////// INPUT

  getInputProps = ({
    onKeyDown,
    onBlur,
    onChange,
    onInput,
    onChangeText,
    ...rest
  } = {}) => {
    let onChangeKey
    let eventHandlers = {}

    /* istanbul ignore next (preact) */
    if (preval`module.exports = process.env.BUILD_PREACT === 'true'`) {
      onChangeKey = 'onInput'
    } else {
      onChangeKey = 'onChange'
    }
    const {inputValue, isOpen, highlightedIndex} = this.getState()

    if (!rest.disabled) {
      eventHandlers = {
        [onChangeKey]: callAllEventHandlers(
          onChange,
          onInput,
          this.input_handleChange,
        ),
        onKeyDown: callAllEventHandlers(onKeyDown, this.input_handleKeyDown),
        onBlur: callAllEventHandlers(onBlur, this.input_handleBlur),
      }
    }

    /* istanbul ignore if (react-native) */
    if (preval`module.exports = process.env.BUILD_REACT_NATIVE === 'true'`) {
      eventHandlers = {
        ...eventHandlers,
        onChangeText: callAllEventHandlers(
          onChangeText,
          onInput,
          this.input_handleTextChange,
        ),
      }
    }

    return {
      'aria-autocomplete': 'list',
      'aria-activedescendant':
        isOpen && typeof highlightedIndex === 'number' && highlightedIndex >= 0
          ? this.getItemId(highlightedIndex)
          : null,
      'aria-controls': isOpen ? this.menuId : null,
      'aria-labelledby': this.labelId,
      autoComplete: 'off',
      value: inputValue,
      id: this.inputId,
      ...eventHandlers,
      ...rest,
    }
  }

  input_handleKeyDown = event => {
    const key = normalizeArrowKey(event)
    if (key && this.keyDownHandlers[key]) {
      this.keyDownHandlers[key].call(this, event)
    }
  }

  input_handleChange = event => {
    this.internalSetState({
      type: Downshift.stateChangeTypes.changeInput,
      isOpen: true,
      inputValue: preval`module.exports = process.env.BUILD_REACT_NATIVE === 'true'`
        ? /* istanbul ignore next (react-native) */ event.nativeEvent.text
        : event.target.value,
    })
  }

  input_handleTextChange /* istanbul ignore next (react-native) */ = text => {
    this.internalSetState({
      type: Downshift.stateChangeTypes.changeInput,
      isOpen: true,
      inputValue: text,
    })
  }

  input_handleBlur = () => {
    // Need setTimeout, so that when the user presses Tab, the activeElement is the next focused element, not the body element
    setTimeout(() => {
      const downshiftButtonIsActive =
        this.props.environment.document.activeElement.dataset.toggle &&
        (this._rootNode &&
          this._rootNode.contains(
            this.props.environment.document.activeElement,
          ))
      if (!this.isMouseDown && !downshiftButtonIsActive) {
        this.reset({type: Downshift.stateChangeTypes.blurInput})
      }
    })
  }

  //\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ INPUT

  /////////////////////////////// MENU

  menuRef = node => (this._menuNode = node)

  getMenuProps = ({refKey = 'ref', ref, ...props} = {}) => {
    return {
      [refKey]: callAll(ref, this.menuRef),
      role: 'listbox',
      'aria-labelledby': props && props['aria-label'] ? null : this.labelId,
      id: this.menuId,
      ...props,
    }
  }
  //\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ MENU

  /////////////////////////////// ITEM
  getItemProps = ({
    onMouseMove,
    onMouseDown,
    onClick,
    onPress,
    index,
    item = requiredProp('getItemProps', 'item'),
    ...rest
  } = {}) => {
    if (index === undefined) {
      this.items.push(item)
      index = this.items.indexOf(item)
    } else {
      this.items[index] = item
    }

    const onSelectKey = preval`module.exports = process.env.BUILD_REACT_NATIVE === 'true'`
      ? /* istanbul ignore next (react-native) */ 'onPress'
      : 'onClick'
    const customClickHandler = preval`module.exports = process.env.BUILD_REACT_NATIVE === 'true'`
      ? /* istanbul ignore next (react-native) */ onPress
      : onClick

    const enabledEventHandlers = {
      // onMouseMove is used over onMouseEnter here. onMouseMove
      // is only triggered on actual mouse movement while onMouseEnter
      // can fire on DOM changes, interrupting keyboard navigation
      onMouseMove: callAllEventHandlers(onMouseMove, () => {
        if (index === this.getState().highlightedIndex) {
          return
        }
        this.setHighlightedIndex(index, {
          type: Downshift.stateChangeTypes.itemMouseEnter,
        })

        // We never want to manually scroll when changing state based
        // on `onMouseMove` because we will be moving the element out
        // from under the user which is currently scrolling/moving the
        // cursor
        this.avoidScrolling = true
        setTimeout(() => (this.avoidScrolling = false), 250)
      }),
      onMouseDown: callAllEventHandlers(onMouseDown, event => {
        // This prevents the activeElement from being changed
        // to the item so it can remain with the current activeElement
        // which is a more common use case.
        event.preventDefault()
      }),
      [onSelectKey]: callAllEventHandlers(customClickHandler, () => {
        this.selectItemAtIndex(index, {
          type: Downshift.stateChangeTypes.clickItem,
        })
      }),
    }

    const eventHandlers = rest.disabled ? {} : enabledEventHandlers

    return {
      id: this.getItemId(index),
      role: 'option',
      'aria-selected': this.getState().selectedItem === item,
      ...eventHandlers,
      ...rest,
    }
  }
  //\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ ITEM

  clearItems = () => {
    this.items = []
  }

  reset = (otherStateToSet = {}, cb) => {
    otherStateToSet = pickState(otherStateToSet)
    this.internalSetState(
      ({selectedItem}) => ({
        isOpen: false,
        highlightedIndex: this.props.defaultHighlightedIndex,
        inputValue: this.props.itemToString(selectedItem),
        ...otherStateToSet,
      }),
      cb,
    )
  }

  toggleMenu = (otherStateToSet = {}, cb) => {
    otherStateToSet = pickState(otherStateToSet)
    this.internalSetState(
      ({isOpen}) => {
        return {isOpen: !isOpen, ...otherStateToSet}
      },
      () => {
        const {isOpen} = this.getState()
        if (isOpen) {
          // highlight default index
          this.setHighlightedIndex(undefined, otherStateToSet)
        }
        cbToCb(cb)()
      },
    )
  }

  openMenu = cb => {
    this.internalSetState({isOpen: true}, cb)
  }

  closeMenu = cb => {
    this.internalSetState({isOpen: false}, cb)
  }

  updateStatus = debounce(() => {
    if (!this._isMounted) {
      return
    }
    const state = this.getState()
    const item = this.items[state.highlightedIndex]
    const resultCount = this.getItemCount()
    const status = this.props.getA11yStatusMessage({
      itemToString: this.props.itemToString,
      previousResultCount: this.previousResultCount,
      resultCount,
      highlightedItem: item,
      ...state,
    })
    this.previousResultCount = resultCount
    /* istanbul ignore else (react-native) */
    if (preval`module.exports = process.env.BUILD_REACT_NATIVE !== 'true'`) {
      setA11yStatus(status)
    }
  }, 200)

  componentDidMount() {
    // the _isMounted property is because we have `updateStatus` in a `debounce`
    // and we don't want to update the status if the component has been umounted
    this._isMounted = true
    /* istanbul ignore if (react-native) */
    if (preval`module.exports = process.env.BUILD_REACT_NATIVE === 'true'`) {
      this.cleanup = () => {
        this._isMounted = false
      }
    } else {
      // this.isMouseDown helps us track whether the mouse is currently held down.
      // This is useful when the user clicks on an item in the list, but holds the mouse
      // down long enough for the list to disappear (because the blur event fires on the input)
      // this.isMouseDown is used in the blur handler on the input to determine whether the blur event should
      // trigger hiding the menu.
      const onMouseDown = () => {
        this.isMouseDown = true
      }
      const onMouseUp = event => {
        const {document} = this.props.environment
        this.isMouseDown = false
        // if the target element or the activeElement is within a downshift node
        // then we don't want to reset downshift
        const contextWithinDownshift = [this._rootNode, this._menuNode].some(
          contextNode =>
            contextNode &&
            (isOrContainsNode(contextNode, event.target) ||
              isOrContainsNode(contextNode, document.activeElement)),
        )
        if (!contextWithinDownshift && this.getState().isOpen) {
          this.reset({type: Downshift.stateChangeTypes.mouseUp}, () =>
            this.props.onOuterClick(this.getStateAndHelpers()),
          )
        }
      }
      // Touching an element in iOS gives focus and hover states, but touching out of
      // the element will remove hover, and persist the focus state, resulting in the
      // blur event not being triggered.
      const onTouchStart = event => {
        const targetInDownshift =
          this._rootNode && isOrContainsNode(this._rootNode, event.target)
        if (!targetInDownshift && this.getState().isOpen) {
          this.reset({type: Downshift.stateChangeTypes.touchStart}, () =>
            this.props.onOuterClick(this.getStateAndHelpers()),
          )
        }
      }

      this.props.environment.addEventListener('mousedown', onMouseDown)
      this.props.environment.addEventListener('mouseup', onMouseUp)
      this.props.environment.addEventListener('touchstart', onTouchStart)

      this.cleanup = () => {
        this._isMounted = false
        this.props.environment.removeEventListener('mousedown', onMouseDown)
        this.props.environment.removeEventListener('mouseup', onMouseUp)
        this.props.environment.removeEventListener('touchstart', onTouchStart)
      }
    }
  }

  componentDidUpdate(prevProps, prevState) {
    if (
      this.isControlledProp('selectedItem') &&
      this.props.selectedItemChanged(
        prevProps.selectedItem,
        this.props.selectedItem,
      )
    ) {
      this.internalSetState({
        type: Downshift.stateChangeTypes.controlledPropUpdatedSelectedItem,
        inputValue: this.props.itemToString(this.props.selectedItem),
      })
    }

    const current =
      this.props.highlightedIndex === undefined ? this.state : this.props
    const prev =
      prevProps.highlightedIndex === undefined ? prevState : prevProps

    if (
      current.highlightedIndex !== prev.highlightedIndex &&
      !this.avoidScrolling
    ) {
      this.scrollHighlightedItemIntoView()
    }

    this.updateStatus()
  }

  componentWillUnmount() {
    this.cleanup() // avoids memory leak
  }

  // eslint-disable-next-line complexity
  render() {
    const children = unwrapArray(this.props.children, noop)
    // because the items are rerendered every time we call the children
    // we clear this out each render and it will be populated again as
    // getItemProps is called.
    this.clearItems()
    // we reset this so we know whether the user calls getRootProps during
    // this render. If they do then we don't need to do anything,
    // if they don't then we need to clone the element they return and
    // apply the props for them.
    this.getRootProps.called = false
    this.getRootProps.refKey = undefined
    this.getRootProps.suppressRefError = undefined
    // we do something similar for getLabelProps
    this.getLabelProps.called = false
    // and something similar for getInputProps
    this.getInputProps.called = false
    const element = unwrapArray(children(this.getStateAndHelpers()))
    if (!element) {
      return null
    }
    if (this.getRootProps.called) {
      if (!this.getRootProps.suppressRefError) {
        validateGetRootPropsCalledCorrectly(element, this.getRootProps)
      }
      return element
    } else if (isDOMElement(element)) {
      // they didn't apply the root props, but we can clone
      // this and apply the props ourselves
      return React.cloneElement(
        element,
        this.getRootProps(getElementProps(element)),
      )
    } else {
      // they didn't apply the root props, but they need to
      // otherwise we can't query around the autocomplete
      throw new Error(
        'downshift: If you return a non-DOM element, you must use apply the getRootProps function',
      )
    }
  }
}

export default Downshift

function validateGetRootPropsCalledCorrectly(element, {refKey}) {
  const refKeySpecified = refKey !== 'ref'
  const isComposite = !isDOMElement(element)
  if (isComposite && !refKeySpecified) {
    throw new Error(
      'downshift: You returned a non-DOM element. You must specify a refKey in getRootProps',
    )
  } else if (!isComposite && refKeySpecified) {
    throw new Error(
      `downshift: You returned a DOM element. You should not specify a refKey in getRootProps. You specified "${refKey}"`,
    )
  }
  if (!getElementProps(element)[refKey]) {
    throw new Error(
      `downshift: You must apply the ref prop "${refKey}" from getRootProps onto your root element.`,
    )
  }
}