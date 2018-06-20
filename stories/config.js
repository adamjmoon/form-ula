/* eslint-disable import/no-extraneous-dependencies, import/no-unresolved, import/extensions, import/max-dependencies */

import {configure, storiesOf} from '@storybook/react'
import React from 'react'

import Form from './examples/form'
import Apollo from './examples/apollo'
import Axios from './examples/axios'

function loadStories() {
  // clear the console to make debugging experience better
  console.clear()

  storiesOf('Examples', module)
    .add('form', () => <Form />)
    .add('apollo', () => <Apollo />)
    .add('axios', () => <Axios />)    
}

configure(loadStories, module)
