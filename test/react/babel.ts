import test from 'ava'
import {transform} from '@babel/core'
import plugin from '../../src/react/babel'

const compile = (code: string) =>
  transform(code, {
    presets: ['@babel/preset-react'],
    plugins: [plugin],
  })

test('Simple Transform', (t) => {
  const code = `
    import * as React from "react"
    import {$mut} from "mute"
    
    function Component(){
        let $a = {name:"reaper"};
        let $b = $mut(React.useState(1));
    
        const onPress = () => {
            const x ={
              ...$a,
              name:"barelyhuman"
            }
            $a = x;
            $b += 1;
        }
    
        return <div>
            <p>{$a.name}</p>
            <p>{$b}</p>
            <button onClick={onPress}>Press</button>
        </div>;
    }
    `

  const result = compile(code)
  if (!result) {
    return t.fail()
  }
  t.snapshot(result.code)
})

test('Reactive props passed around components', (t) => {
  const code = `
    import * as React from "react"
    import {$mut} from "mute"
    
    function Component({$count,...props}){
      const {$count2:x,$count3} = props
      const $x = $mut(x);
        const onPress = () => {
            $count += 1;
            $x-=1
            $count3*=2
        }
    
        return <div>
            <p>{$count}</p>
            <p>{$x}</p>
            <p>{$mut($count3)[0]}</p>
            <button onClick={onPress}>Press</button>
        </div>;
    }

    function ParentComponent(){
      let $a = 0;
      let $b = 999;
      let $c = 1;
      return <Component $count={$mut($a)} $count2={$mut($b)} $count3={$mut($c)}/>
    }
    `
  const result = compile(code)
  if (!result) {
    return t.fail()
  }
  t.snapshot(result.code)
})

test.skip('Check Functional Scope', (t) => {
  const code = `
    import * as React from "react"
    
    let $b = 2;

    function Component(){
        let $a = 1;
    
        const onPress = () => {
            $a += 1;
            $b = 3;
        }
    
        return <div>
            <p>{$a}</p>
            <button onClick={onPress}>Press</button>
        </div>;
    }`

  const result = compile(code)
  if (!result) {
    return t.fail()
  }
  t.snapshot(result.code)
})

test.skip('Check Arrow Function Scope', (t) => {
  const code = `
    import * as React from "react";

    let $b = 2;
    
    const Component = () => {
      let $a = 1;
    
      const onPress = () => {
        $a += 1;
        $b = 3;
      };
    
      return (
        <div>
          <p>{$a}</p>
          <button onClick={onPress}>Press</button>
        </div>
      );
    };
    `

  const result = compile(code)
  if (!result) {
    return t.fail()
  }
  t.snapshot(result.code)
})

test.skip('Multi Component Scope', (t) => {
  const code = `
    import * as React from "react";

    let $b = 2;

    const Component = () => {
    let $a = 1;

    const onPress = () => {
        $a += 1;
        $b = 3;
    };

    return (
        <div>
        <p>{$a}</p>
        <button onClick={onPress}>Press</button>
        </div>
    );
    };

    const ComponentTwo = () => {
    let $a = 3;

    const onPress = () => {
        $a = 5;
        $b = 3;
    };

    return (
        <div>
        <p>{$a}</p>
        <button onClick={onPress}>Press</button>
        </div>
    );
    };
`

  const result = compile(code)
  if (!result) {
    return t.fail()
  }
  t.snapshot(result.code)
})

test.skip('Hook Function and useEffect dep', (t) => {
  const code = `
    import * as React from "react";

    const useCustomHook = () => {
    let $a = 1;


    React.useEffect(()=>{
      console.log("updated");
    },[$a])


    const onPress = () => {
        $a += 1;
    };

    return {
      a:$a,
      onPress
    }
  }
`

  const result = compile(code)
  if (!result) {
    return t.fail()
  }
  t.snapshot(result.code)
})

test.skip('Singular Binary Expressions', (t) => {
  const code = `
  import React from "react";
  
  export default function App() {
    let $count = 1;
  
    const handleClick = () => {
      $count = $count + 1;
      $count = $count * 2;
    };
  
    return (
      <div>
        <h1>{$count}</h1>
        <button onClick={handleClick}>Click</button>
      </div>
    );
  }
  `
  const result = compile(code)
  if (!result) {
    return t.fail()
  }
  t.snapshot(result.code)
})

test.skip('Object Update', (t) => {
  const code = `
  import * as React from "react";
  
  function App() {
    let $user = { name: "reaper" };
    const updateUser = () => {
      const x = {
        ...$user
      };
      x.name = "barelyhuman";
      $user = x;
    };
    return (
      <>
        <p>{$user.name}</p>
        <button onClick={updateUser}>Click Me</button>
      </>
    );
  }
  `

  const result = compile(code)
  if (!result) {
    return t.fail()
  }
  t.snapshot(result.code)
})

test.skip('Array Update', (t) => {
  const code = `
  import * as React from "react";
  
  function App() {
    let $users = [{ name: "reaper" }];

    const updateUser = () => {
      const _nextUsers =$users.slice();
      _nextUsers[0].name = "barelyhuman"
      $user = _nextUsers;
    };

    return (
      <>
      {$users.map(user=>{
        return <p>{user.name}</p>
      })}
      <button onClick={updateUser}>Click Me</button>
      </>
    );
  }
  `

  const result = compile(code)
  if (!result) {
    return t.fail()
  }
  t.snapshot(result.code)
})
