import * as t from '@babel/types'

const PACKAGE_NAME = 'mute'
const COMPILE_TIME_FUNC_NAME = '$mut'

type ToModifyVariableI = {
  raw: string
}

type IgnoreNode = {
  type: string
  start: number
  end: number
}

let reactiveMemo = new Map()
let getterMemo = new Map()
let setterMemo = new Map()

export default function () {
  let toMod: ToModifyVariableI[] = []
  return {
    visitor: {
      Program: {
        enter: (path: any, state: any) => {
          // resetting the memo
          // could be a part of state but would have to tranfer
          //  the state around quite a bit

          reactiveMemo = new Map()
          getterMemo = new Map()
          setterMemo = new Map()

          // list of nodes to ignore for modifications
          state.ignoreList = <IgnoreNode[]>[]

          // to check if the compileFunc has been imported
          // if yes then use the name / custom local alias
          state.compileFunc = {
            using: false,
            name: '',
          }
        },
      },
      ImportDeclaration(path: any, state: any) {
        const {using, name} = isUsingMute(path.node)
        if (!using) {
          return
        }

        state.compileFunc.using = true
        state.compileFunc.name = name as string
        path.remove()
      },
      FunctionDeclaration(path: any, state: any) {
        toMod = toMod.concat(getReactiveVariablesFromScope(path.scope, state))
        transformToStateByScope(path, toMod, state)
      },
      ArrowFunctionExpression(path: any, state: any) {
        toMod = toMod.concat(getReactiveVariablesFromScope(path.scope, state))
        transformToStateByScope(path, toMod, state)
      },
    },
  }
}

function transformToStateByScope(
  path: any,
  toMod: ToModifyVariableI[],
  state: any
) {
  // nested traverse to avoid replacing bindings of anything other than what's in this
  // function. To prevent creating state hooks outside a function
  path.traverse({
    Identifier(path: any) {
      const inIgnoreList = state.ignoreList.findIndex((x: IgnoreNode) => {
        return (
          x.start === path.node.start &&
          x.end === path.node.end &&
          x.type === path.node.type
        )
      })

      if (inIgnoreList > -1) {
        return
      }

      if (
        state.compileFunc.using &&
        path.node.name === state.compileFunc.name
      ) {
        return
      }

      if (is$mutCall(path.parentPath.node, state)) {
        path.parentPath.replaceWith(path.node)
        state.ignoreList.push(<IgnoreNode>{
          type: path.parentPath.node.type,
          start: path.parentPath.node.start,
          end: path.parentPath.node.end,
        })
        return
      }

      if (
        isReactiveIdentifier(path.node.name, toMod) &&
        !t.isVariableDeclarator(path.parentPath) &&
        !t.isAssignmentExpression(path.parentPath) &&
        !t.isObjectProperty(path.parentPath) &&
        !t.isJSXAttribute(path.parentPath.parentPath)
      ) {
        if (isCompiledSetterGetter(path.parentPath)) {
          return
        }

        // console.log(path.node)
        path.replaceWith(getGetterExpressionForReactive(path.node.name))
      }
    },
    VariableDeclaration({node}: {node: t.VariableDeclaration}) {
      transformReactiveDeclarations(node, toMod, path, state)
    },
    ExpressionStatement({node}: {node: t.ExpressionStatement}) {
      transformAssignmentExpression(node, toMod)
    },
  })
}

function transformReactiveDeclarations(
  node: t.VariableDeclaration,
  toMod: ToModifyVariableI[],
  path: any,
  state: any
) {
  for (let i = 0; i < node.declarations.length; i += 1) {
    const declaration = node.declarations[i]

    if (
      !(
        t.isIdentifier(declaration.id) &&
        isReactiveIdentifier(declaration.id.name, toMod)
      )
    ) {
      continue
    }

    // change to const if it's `let` by any chance
    node.kind = 'const'

    if (
      t.isCallExpression(declaration.init) &&
      is$mutCall(declaration.init, state)
    ) {
      declaration.init = declaration.init.arguments[0] as t.Expression
      continue
    }

    // convert `let $a = 1` to `const $a = React.useState(1)`
    node.declarations[i] = t.variableDeclarator(
      t.identifier(declaration.id.name),
      t.callExpression(
        t.memberExpression(t.identifier('React'), t.identifier('useState')),
        declaration.init ? [declaration.init] : []
      )
    )

    // fallback to replace missed instances of the variable
    // path.scope.rename(declaration.id.name, normName)
  }
}

function transformAssignmentExpression(
  node: t.ExpressionStatement,
  toMod: ToModifyVariableI[]
) {
  if (!t.isAssignmentExpression(node.expression)) {
    return
  }
  //HACK: forced to assignment expression for now, will need to switch to a `switch`
  // statement when working with both Assignment(=,+=,-=,etc) and Update expressions(++,--,**,etc)
  const expression: t.AssignmentExpression = node.expression

  if (!t.isIdentifier(expression.left)) {
    return
  }

  if (!isReactiveIdentifier(expression.left.name, toMod)) {
    return
  }

  const getterName = getGetterExpressionForReactive(expression.left.name)
  const setterName = getSetterExpressionForReactive(expression.left.name)

  let callArgs: t.Expression[]

  switch (expression.operator) {
    case '=': {
      callArgs = [{...expression.right}]
      break
    }

    case '+=': {
      callArgs = [t.binaryExpression('+', getterName, expression.right)]
      break
    }

    case '-=': {
      callArgs = [t.binaryExpression('-', getterName, expression.right)]
      break
    }

    case '/=': {
      callArgs = [t.binaryExpression('/', getterName, expression.right)]
      break
    }

    case '*=': {
      callArgs = [t.binaryExpression('*', getterName, expression.right)]
      break
    }
    default: {
      callArgs = []
    }
  }

  node.expression = t.callExpression(setterName, callArgs)
}

function isReactiveIdentifier(idName: string, modMap: ToModifyVariableI[]) {
  if (reactiveMemo.has(idName)) {
    return reactiveMemo.get(idName)
  }
  const result = modMap.findIndex((x) => x.raw === idName) > -1
  reactiveMemo.set(idName, modMap.findIndex((x) => x.raw === idName) > -1)
  return result
}

function getSetterName(normalizedName: string) {
  return (
    'set' + normalizedName.charAt(0).toUpperCase() + normalizedName.slice(1)
  )
}

function normalizeName(n: string) {
  return n.replace(/\$/, '')
}

function isReadingReactiveValue(
  node: t.CallExpression,
  modMap: ToModifyVariableI[]
) {
  if (
    !(
      t.isIdentifier(node.callee) &&
      isReactiveIdentifier(node.callee.name, modMap)
    )
  ) {
    return false
  }
  return true
}

function getReactiveVariablesFromScope(scope: any, state: any) {
  const toMod: ToModifyVariableI[] = []
  Object.keys(scope.bindings).forEach((binding) => {
    if (state.compileFunc.using && binding === state.compileFunc.name) {
      return
    }
    if (/^\$/.test(binding)) {
      // add to list of identifiers to compare and replace
      // (not using scope replace to avoid shadow variables being replaced)
      toMod.push({
        raw: binding,
      })
    }
  })
  return toMod
}

function isUsingMute(importDeclaration: t.ImportDeclaration) {
  if (
    !(
      t.isStringLiteral(importDeclaration.source) &&
      importDeclaration.source.value === PACKAGE_NAME
    )
  ) {
    return {using: false, name: null}
  }

  const referenceSpecifier = importDeclaration.specifiers.find((item) => {
    if (!(t.isImportSpecifier(item) && t.isIdentifier(item.imported))) {
      return false
    }
    return item.imported.name === COMPILE_TIME_FUNC_NAME
  })

  let name = null

  if (referenceSpecifier) {
    name = referenceSpecifier.local.name || null
  }

  return {using: true, name}
}

function getSetterExpressionForReactive(identifierName: string) {
  if (setterMemo.has(identifierName)) {
    return setterMemo.get(identifierName)
  }
  const memExp = t.memberExpression(
    t.identifier(identifierName),
    t.numericLiteral(1),
    true
  )
  setterMemo.set(identifierName, memExp)
  return memExp
}

function getGetterExpressionForReactive(identifierName: string) {
  if (getterMemo.has(identifierName)) {
    return getterMemo.get(identifierName)
  }
  const memExp = t.memberExpression(
    t.identifier(identifierName),
    t.numericLiteral(0),
    true
  )
  getterMemo.set(identifierName, memExp)
  return memExp
}

function is$mutCall(node: t.CallExpression, state: any) {
  if (
    !(
      t.isCallExpression(node) &&
      t.isIdentifier(node.callee) &&
      state.compileFunc.using &&
      node.callee.name === state.compileFunc.name
    )
  ) {
    return false
  }
  return true
}

function isCompiledSetterGetter(path: any) {
  if (!t.isMemberExpression(path.node)) {
    return false
  }

  const {node}: {node: t.MemberExpression} = path
  if (
    !(
      t.isNumericLiteral(node.property) &&
      (node.property.value === 0 || node.property.value === 1)
    )
  ) {
    return false
  }

  return true
}
