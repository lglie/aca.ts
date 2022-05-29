import * as Cst from '../constant'

export const reactPage = (consts: string) =>
`import React, { useState } from 'react'
import logo from './logo.svg'
import './App.css'
import { ${consts} } from './${Cst.DefaultClientApiDir}'

function App() {
  const [state, setState] = useState(
    'The data obtained from the backend will be displayed here'
  )
  async function click() {
    await Blog.user.insert({
      data: {
        firstName: 'foo',
        lastName: 'bar',
      },
    })
    //Return id by Using RPC example:
    const rtn = await $RPC.server.example({ firstName: 'foo', lastName: 'bar' })
    setState(JSON.stringify(rtn))
  }

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.tsx</code> and save to reload.
        </p>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
        <div>
          {state}
          <button onClick={click}>Click here to test</button>
        </div>
      </header>
    </div>
  )
}

export default App  
`
