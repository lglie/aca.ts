/// <reference types="../types" />
import fs from 'fs'
import path from 'path'
import { MapRename, ScalarTypes } from '../libs/common'
import * as Cst from '../libs/constant'
import { Delimiter } from '../libs/constant'
import SqlDiff from '../libs/sql-diff'
import * as ts from 'typescript'

BigInt.prototype['toJSON'] = function () {
  return this.toString()
}

const KindCode = {
  [ts.SyntaxKind.ImportDeclaration]: 'import',
  [ts.SyntaxKind.VariableStatement]: 'const',
  [ts.SyntaxKind.BooleanKeyword]: 'boolean',
  [ts.SyntaxKind.NumberKeyword]: 'number',
  [ts.SyntaxKind.StringKeyword]: 'string',
  [ts.SyntaxKind.EnumDeclaration]: 'enum',
  [ts.SyntaxKind.ClassDeclaration]: 'table',
  [ts.SyntaxKind.ModuleDeclaration]: 'namespace',
}

// 限定名解析
const QualifiedName = (n: ts.QualifiedName | ts.Identifier) => {
  let rtn = ''
  if (n.kind === ts.SyntaxKind.Identifier) return n.text
  switch (n.left.kind) {
    case ts.SyntaxKind.QualifiedName:
      rtn += QualifiedName(n.left)
      break
    case ts.SyntaxKind.Identifier:
      rtn += n.left.text
  }
  return rtn + '.' + n.right.text
}

// 节点属性解析
const NodeParse = {
  type(typ: ts.TypeNode): string {
    // 是数组类型
    if (typ.kind === ts.SyntaxKind.ArrayType)
      return (
        NodeParse.type((<ts.ArrayTypeNode>typ).elementType) +
        ((<ts.ArrayTypeNode>typ).elementType['typeName']?.text === 'id'
          ? ''
          : '[]')
      )
    let rtn = ''
    switch (typ.kind) {
      case ts.SyntaxKind.BooleanKeyword:
      case ts.SyntaxKind.StringKeyword:
      case ts.SyntaxKind.NumberKeyword:
      case ts.SyntaxKind.BigIntKeyword:
      case ts.SyntaxKind.ObjectKeyword:
      case ts.SyntaxKind.AnyKeyword:
        rtn = {
          [ts.SyntaxKind.BooleanKeyword]: 'boolean',
          [ts.SyntaxKind.StringKeyword]: 'string',
          [ts.SyntaxKind.NumberKeyword]: 'number',
          [ts.SyntaxKind.BigIntKeyword]: 'bigint',
          [ts.SyntaxKind.ObjectKeyword]: 'object',
          [ts.SyntaxKind.AnyKeyword]: 'any',
        }[typ.kind]
        break
      case ts.SyntaxKind.IndexedAccessType:
        const idx = <ts.IndexedAccessTypeNode>typ
        const typeName = QualifiedName(
          <ts.QualifiedName>(<ts.TypeReferenceNode>idx.objectType).typeName
        )
        rtn = `${typeName}[${
          (<ts.StringLiteral>(<ts.LiteralTypeNode>idx.indexType).literal).text
        }]`
        break
      case ts.SyntaxKind.TypeReference:
        rtn = QualifiedName(
          <ts.QualifiedName>(<ts.TypeReferenceNode>typ).typeName
        )
        break
      case ts.SyntaxKind.QualifiedName:
        rtn = QualifiedName(<any>typ)
        break
      default:
        console.log(`没有被处理的数据类型：`, JSON.stringify(typ, null, 2))
    }
    return rtn
  },
  initializer(exp: ts.Expression): Initializer {
    let rtn, text
    switch (exp.kind) {
      case ts.SyntaxKind.TrueKeyword: // 是true
      case ts.SyntaxKind.FalseKeyword: // 是false
        rtn = {
          type: 'boolean',
          initializer: {
            [ts.SyntaxKind.TrueKeyword]: true,
            [ts.SyntaxKind.FalseKeyword]: false,
          }[exp.kind],
        }
        break
      case ts.SyntaxKind.NumericLiteral: // 是数字字面量
        text = (<ts.NumericLiteral>exp).text
        rtn = {
          type: text.indexOf('.') === -1 ? 'int' : 'float',
          initializer: text,
        }
        break
      case ts.SyntaxKind.BigIntLiteral: // 是bigint字面量
        rtn = {
          type: 'bigint',
          initializer: `${(<ts.BigIntLiteral>exp).text.replace(/n$/, '')}`,
        }
        break
      case ts.SyntaxKind.StringLiteral: // 是字符串字面量
        rtn = {
          type: 'string',
          initializer: `${(<ts.StringLiteral>exp).text}`,
        }
        break
      case ts.SyntaxKind.PropertyAccessExpression: // 是枚举值
        rtn = {
          type: <string>(
            (<ts.Identifier>(<ts.PropertyAccessExpression>exp).expression)
              .escapedText
          ),
          initializer: `'${
            (<ts.PropertyAccessExpression>exp).name.escapedText
          }'`,
        }
        break
      case ts.SyntaxKind.ObjectLiteralExpression: // 是对象
        rtn = {
          type: 'object',
          initializer: (<ts.ObjectLiteralExpression>exp).properties.reduce(
            (_3, v3) => {
              _3[(<ts.Identifier>v3.name).text] = NodeParse.initializer(
                (<ts.PropertyAssignment>v3).initializer
              )
              return _3
            },
            {}
          ),
        }
        break
      case ts.SyntaxKind.Identifier: // 是标识符
        rtn = {
          type: 'Identifier',
          initializer: `'${(<ts.Identifier>exp).text}'`,
        }
        break
      case ts.SyntaxKind.CallExpression: // 是函数表达式
      case ts.SyntaxKind.NewExpression: // 是实例表达式
        rtn = {
          type: {
            [ts.SyntaxKind.CallExpression]: 'callExpression',
            [ts.SyntaxKind.NewExpression]: 'newExpression',
          }[exp.kind],
          expression: (<ts.Identifier>(<ts.NewExpression>exp).expression).text,
          initializer:
            (<ts.NewExpression>exp).arguments?.map((v) =>
              NodeParse.initializer(v)
            ) || [],
        }
        switch (rtn.expression) {
          case 'BigInt':
            rtn = {
              type: 'bigint',
              initializer: rtn.initializer[0].initializer.replace(/n/, ''),
            }
            break
          case 'Date':
            rtn = {
              type: 'datetime',
              initializer: 'CURRENT_TIMESTAMP',
            }
            break
        }
        break
      case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
        rtn = {
          type: 'NoSubstitutionTemplateLiteral',
          initializer: (<ts.NoSubstitutionTemplateLiteral>exp).text,
        }
        break
      default:
        console.log(`没有处理的默认值: ${JSON.stringify(exp, null, 2)}`)
        rtn = { type: '', initializer: '' }
    }
    return rtn
  },
  decorator(objs: ts.Node['decorators']) {
    if (!objs || !objs.length) return {}
    const props = objs.reduce((_, v) => {
      const exp = v.expression
      let key = '',
        value
      switch (exp.kind) {
        case ts.SyntaxKind.Identifier: //无命名空间，无参数（true）
          key = (<ts.Identifier>exp).text
          value = true
          break
        case ts.SyntaxKind.PropertyAccessExpression: // 带一级命名空间，无参数
          key = (<ts.PropertyAccessExpression>exp).name.text
          value = true
          break
        case ts.SyntaxKind.CallExpression: // 带一级命名空间，有参数
          const callExp = <ts.PropertyAccessExpression>(
            (<ts.CallExpression>exp).expression
          )
          key =
            QualifiedName(
              <ts.Identifier | ts.QualifiedName>callExp.expression
            ) +
            '.' +
            callExp.name.text
          value = (<ts.CallExpression>exp).arguments.map((v2) => {
            // 是单个元素
            if ((<ts.Identifier>v2).text) {
              return (<ts.Identifier>v2).text
            } // 是数组参数
            else if ((<ts.ArrayLiteralExpression>v2).elements) {
              return (<ts.ArrayLiteralExpression>v2).elements.map(
                (v3) => (<ts.Identifier>v3).text
              )
            } // 是对象参数
            else if ((<ts.ObjectLiteralExpression>v2).properties) {
              return (<ts.ObjectLiteralExpression>v2).properties.reduce(
                (_3: any, v3: any) => {
                  _3[v3.name.text] =
                    v3.initializer.text ||
                    v3.initializer.elements?.map((v4: any) => v4.text)
                  return _3
                },
                {}
              )
            }
          }, {})[0]
      }

      if (['$.unique', '$.index'].includes(key)) {
        const k = { '$.unique': 'uniques', '$.index': 'indexes' }[key]!
        _[k] = _[k] || []
        _[k].push(value)
      } else {
        _[key.split('.').reverse()[0]] = value
      }

      return _
    }, {})

    return props
  },
}

async function PickModel(acaDir: '.' | '..', ast: ts.SourceFile) {
  const resolveAcaDir = path.resolve(acaDir)
  const config: Config = await import(path.join(resolveAcaDir, Cst.AcaConfig))
  const schm = {
    imports: <Import[]>[],
    vars: <any>[],
  }
  const Iter = (
    subAst: ts.SourceFile | ts.ModuleBlock,
    namespace: string[] = []
  ) => {
    let qualified = config.databases['default'].tableNameWithNamespace
      ? namespace
      : []

    return subAst.statements.reduce((_, v) => {
      let name
      switch (v.kind) {
        case ts.SyntaxKind.ImportDeclaration: // 是import语句
          let named = <ImportName>{}
          const importV = <ts.ImportDeclaration>v
          let clause = importV.importClause
          if (
            (<ts.Identifier>importV.moduleSpecifier).text ===
            './schema-property'
          )
            break
          if (clause?.name) {
            named[clause.name.text] = 'default'
          }
          if (clause?.namedBindings) {
            switch (clause.namedBindings.kind) {
              case ts.SyntaxKind.NamespaceImport: // * as xx
                named[clause.namedBindings.name.text] = '*'
                break
              case ts.SyntaxKind.NamedImports: //{xx, xx}
                clause.namedBindings.elements.forEach((v2: any) => {
                  named[v2.name.text] = v2.propertyName?.text || v2.name.text
                })
            }
          }
          schm.imports.push({
            named,
            from: (<ts.Identifier>importV.moduleSpecifier).text,
          })
          break
        case ts.SyntaxKind.VariableStatement: // 是变量声明
          const varV = <ts.VariableStatement>v
          const names = varV.declarationList.declarations.reduce((_2, v2) => {
            const namesRtn = {
              name: (<ts.Identifier>v2.name).text,
              type: '',
              initializer: '',
            }
            // 有初始值
            if (v2.initializer) {
              const init = NodeParse.initializer(v2.initializer)
              if ('$db' === (<any>v2.type)?.typeName.text) {
                namesRtn.name = '$'
                namesRtn.initializer = init.initializer
              }

              // 有类型，覆盖上面的类型
              namesRtn.type = v2.type ? KindCode[v2.type.kind] : init.type
              if (['int', 'float'].includes(namesRtn.type))
                namesRtn.type = 'number'
              namesRtn.initializer = init.initializer
            }
            _2.push(namesRtn)
            return _2
          }, <{ name: string; type: string; initializer: string }[]>[])
          if (1 === names.length && '$' === names[0].name) {
            _['$'] = { kind: 'dbConfig', $: names[0].initializer }
          } else schm.vars.push({ kind: 'const', names })
          break
        case ts.SyntaxKind.ModuleDeclaration: // 模块声明(module)
          const moduleV = <ts.ModuleDeclaration>v
          name = moduleV.name.text
          _[name] = {
            kind: 'namespace',
            name,
            namespace: namespace.slice(1) || [],
            models: Iter(<ts.ModuleBlock>moduleV.body, [...namespace, name]),
          }
          break
        case ts.SyntaxKind.EnumDeclaration: // 是枚举声明(enum)
          const enumV = <ts.EnumDeclaration>v
          name = enumV.name.text
          _[name] = {
            kind: 'enum',
            name,
            namespace,
            jsName: [...qualified, name].join(Delimiter),
            values: enumV.members.map((v2) => (<ts.Identifier>v2.name).text),
          }
          break
        case ts.SyntaxKind.ClassDeclaration: // 表声明(class)
          const classV = <ts.ClassDeclaration>v
          name = classV.name.text
          let props = NodeParse.decorator(
            <ts.Node['decorators']>(classV.decorators || [])
          )
          let MR = MapRename(props)
          const body = {
            kind: 'table',
            name,
            map: MR.map,
            namespace: namespace.slice(1) || [],
          }
          if (classV.heritageClauses) {
            body['extends'] = classV.heritageClauses.map(
              (v) => (<ts.Identifier>v.types[0].expression).escapedText
            )
          }
          body['jsName'] = [...qualified, name].join(Delimiter)
          body['dbName'] = [...(qualified.slice(1) || []), MR.map || name].join(
            Delimiter
          )
          if (props['view']) {
            body.kind = 'view'
            delete props['view']
          } else {
            body['uniques'] = []
            body['indexes'] = []
            if (props['id'])
              (body['id'] = props['id']), body['uniques'].push(props['id'])
            if (props['uniques']) body['uniques'].push(...props['uniques'])
            if (props['indexes']) body['indexes'].push(...props['indexes'])
          }
          body['props'] = props
          body['columns'] = classV.members.reduce((_2, v2) => {
            const V2 = <ts.PropertyDeclaration>v2
            props = NodeParse.decorator(
              <ts.Node['decorators']>(V2.decorators || [])
            )
            MR = MapRename(props)
            let colKey = (<ts.Identifier>V2.name).text
            const col = {
              name: colKey,
              map: MR.map,
              optional: V2.questionToken ? 'optional' : 'required',
            }
            col['jsName'] = colKey
            col['dbName'] = MR.map || colKey
            if (body.kind === 'table') {
              col['props'] = props
              if (props['unique']) body['uniques'].push([colKey])
              if (props['index']) body['indexes'].push([colKey])
            }
            // 处理初始值
            let init
            if (V2.initializer) {
              init = NodeParse.initializer(V2.initializer)
              col['props']['default'] = init.initializer
              col.optional = 'optional'
            }
            // 处理类型定义
            if (V2.type) {
              col['type'] = NodeParse.type(V2.type)
              const idType = col['type'].match(/^id(\[\w+\])?$/)
              if (idType) {
                col['props'].isId = true
                // body['id'] = col.name
              }
            }
            // 如果没有定义数据类型，根据初始值进行推断
            else {
              if (!init) throw `字段: ${colKey}, 没有定义数据类型`
              col['type'] = init.type
            }
            _2[colKey] = col
            return _2
          }, {})
          _[name] = body
          break
        default:
          console.log(`字段类型不被schema所支持：${JSON.stringify(v)}`)
      }
      return _
    }, {})
  }

  const dbs: DbModels = Iter(ast)

  // 查找变量kD对应的数据库的配置信息
  const DbConfig = (db: DbVar) => {
    // 默认使用config里database字段(.)作为实例化参数
    if (!db.models['$']) {
      if (config.databases) {
        db.models['$'] = <DbConfig>config.databases['default']
      } else throw `config文件里没有配置数据库实例化参数`
    } // 指向config/database里的某一个字段路径
    else {
      const confName = db.models['$']['$']
      if (typeof confName === 'string') {
        db.models['$'] = config?.databases[confName] || confName
      } else if (typeof confName === 'object') {
        db.models['$'] = confName
      } else `数据库初始化参数配置错误！`
    }
  }

  // 完善表
  const Perfect = (db: Models, dbVar: string) => {
    // 查找表或枚举
    const findModel = (namespace: string[], relName: string) => {
      let rtn
      const qual = relName.split('.')
      const nsModels = (ns: string[]) =>
        ns.reduce((_, k) => (_ = (<Namespace>_[k]).models), db)

      const mdl = (mdls: Models, name: string) => {
        Object.keys(mdls).some((k) => {
          if ('namespace' !== mdls[k].kind) {
            const key = mdls[k].name
            if (key === name) return (rtn = mdls[k])
          }
        })
      }

      if (qual.length === 1) {
        for (let i = namespace.length; i >= 0; i--) {
          mdl(nsModels(namespace.slice(0, i)), relName)
          if (rtn) break
        }
        rtn = rtn || dbs[relName] // 为根目录下的枚举类型
      } // 含有命名空间限定符
      else {
        const ns = qual.slice(0, -1)

        for (let i = namespace.length; i >= 0; i--) {
          const mdls = nsModels(namespace.slice(0, i))

          if (mdls[ns[0]]) {
            try {
              mdl(
                ns.reduce((_, k) => (_ = (<Namespace>_[k]).models), mdls),
                qual.slice(-1)[0]
              )
            } catch (e) {
              break
            }
            if (rtn) break
          }
        }
      }

      if (!rtn) throw `没有查找到类型定义：${relName}`

      return <Model>rtn
    }

    const driver = (<DbConfig>(<DbVar['models']>db)['$']).connectOption.driver
    const sqlDiff = SqlDiff(driver)
    const IterFill = (subModels: Models) => {
      for (const k in subModels) {
        // 标量字段的jsType、dbType、id
        switch (subModels[k].kind) {
          case 'namespace':
            IterFill((<Namespace>subModels[k]).models)
            break
          case 'view':
            break
          case 'table':
            // 获取变量对应的数据库引擎
            const tbl = <Table>subModels[k]
            // 如果有基类，则把把基类中的字段填充到表中
            if (tbl.extends) {
              const base = <Table>findModel(tbl.namespace, tbl.extends[0])
              Object.assign(tbl.columns, base.columns)
            }
            for (const k2 in tbl.columns) {
              const col = tbl.columns[k2]
              const typ = col.type.match(/([^\[]+)(?:\[(\w+)\])?(\[\])?/)!

              switch (typ[1]) {
                case 'id':
                  tbl.id = [col.jsName]
                  tbl.uniques.push([col.jsName])

                  const idType =
                    typ[2] ||
                    (sqlDiff.keyword.dbTypes.autoincrement.includes(
                      col.props.dbType
                    )
                      ? 'autoincrement'
                      : sqlDiff.keyword.dbTypes.int.includes(col.props.dbType)
                      ? 'int'
                      : col.props.dbType?.toLocaleLowerCase().includes('char')
                      ? 'string'
                      : (<DbConfig>(<DbVar['models']>db)['$']).idDefaultType) ||
                    sqlDiff.keyword.idDefaultType

                  col.type = 'id'
                  col.optional = ['cuid', 'uuid', 'autoincrement'].includes(
                    idType
                  )
                    ? 'optional'
                    : 'required'
                  col.props.idType = idType
                  col.props.jsType = sqlDiff.keyword.idType[idType].jsType
                  col.props.dbType =
                    col.props.dbType || sqlDiff.keyword.idType[idType].dbType
                  break
                case 'Date':
                  if (col.props.createdAt || col.props.updatedAt)
                    col.optional = 'optional'
                case 'boolean':
                case 'int':
                case 'float':
                case 'bigint':
                case 'string':
                case 'object':
                  col.props.jsType = col.type.replace(
                    typ[1],
                    sqlDiff.keyword.scalarType[typ[1]].jsType
                  ) // 可能是数组
                  col.props.dbType =
                    col.props.dbType ||
                    col.type.replace(
                      typ[1],
                      sqlDiff.keyword.scalarType[typ[1]].dbType
                    )
                  break
                case 'enum':
                  break
                // 枚举类型或表关系类型, 添加外键字段，建立关系字段，枚举类型替换为全命名空间的全名
                default:
                  // 查找该枚举或类的定义
                  const relModel = findModel(tbl.namespace, typ[1])
                  switch ((<Model>relModel).kind) {
                    case 'enum': // 是枚举
                      col.type = 'enum'
                      col.props.dbType = 'varchar(20)'
                      col.props.jsType = (<Enum>relModel).jsName
                      break
                    case 'table': // 是关系, 先完善type的完全限定名
                      const lastDot = typ[1].lastIndexOf('.')
                      const relTbl = typ[1].slice(lastDot + 1)
                      const qualNs = [...relModel.namespace]
                      col.type = [...qualNs, relTbl].join('.') + (typ[3] || '')
                      col.props.jsType = `${[dbVar, ...qualNs].join(Delimiter)}`
                  }
              }
            }
        }
      }
    }

    const IterRelate = (subModels: DbVar | Models) => {
      for (const k in subModels) {
        switch (subModels[k].kind) {
          case 'namespace':
            IterRelate((<Namespace>subModels[k]).models)
            break
          case 'table':
            const typeReg = /([^\[]+)(?:\[(\w+)\])?(\?|\[\])?$/
            const tbl = <Table>subModels[k]
            const tblName = [...tbl.namespace, tbl.name].join('.')

            for (const k2 in tbl.columns) {
              const col = tbl.columns[k2]
              const typ = col.type.match(typeReg)!
              if (!ScalarTypes.includes(typ[1]) && !col.props.dbType) {
                // 查找关系表
                const relTbl = <Table>findModel(tbl.namespace, typ[1])
                for (const relK2 in relTbl.columns) {
                  const relCol = relTbl.columns[relK2]
                  const relTyp = relCol.type.match(typeReg)!
                  // 修改类型、添加外键
                  const modify = () => {
                    col.type =
                      [...relTbl.namespace, relTbl.name, relCol.name].join(
                        '.'
                      ) +
                      (typ[3] || (relCol.optional === 'optional' ? '?' : ''))

                    relCol.type =
                      [...tbl.namespace, tbl.name, col.name].join('.') +
                      (relTyp[3] || (col.optional === 'optional' ? '?' : ''))

                    col.props.jsType +=
                      Delimiter +
                      relTbl.name +
                      '.' +
                      relCol.name +
                      (typ[3] || (relCol.optional === 'optional' ? '?' : ''))

                    relCol.props.jsType +=
                      Delimiter +
                      tbl.name +
                      '.' +
                      col.name +
                      (relTyp[3] || (col.optional === 'optional' ? '?' : ''))

                    col.props.dbType =
                      [...relTbl.namespace, relTbl.map || relTbl.name].join(
                        Delimiter
                      ) +
                      '.' +
                      (relCol.map || relCol.name) +
                      (typ[3] || (relCol.optional === 'optional' ? '?' : ''))
                    relCol.props.dbType =
                      [...tbl.namespace, tbl.map || tbl.name].join(Delimiter) +
                      '.' +
                      (col.map || col.name) +
                      (relTyp[3] || (col.optional === 'optional' ? '?' : ''))

                    // 添加外键字段
                    const addForeign = (
                      PT: Table, // 主键表
                      PF: Column, // 主键字段
                      FT: Table, // 外键表
                      FF: Column // 外键字段
                    ) => {
                      let FR = FF.props.foreign
                      // 如果FR是字符串或字符串数组，则默认引用主键表的id
                      if (typeof FR === 'string' || Array.isArray(FR)) {
                        const tmpFR = {
                          keys: <string[]>[],
                          references: <string[]>[],
                        }
                        tmpFR.keys = typeof FR === 'string' ? [FR] : FR
                        if (PT.id.length === tmpFR.keys.length)
                          tmpFR.references = PT.id
                        else throw `外键与引用的主键长度不符：${FR}`
                        FR = FF.props.foreign = tmpFR
                      }
                      // 如果是一对多的关系，则需要将主键表的对应的字段optional设置为：array
                      if (PF.type.endsWith(']')) {
                        PF.type = PF.type.replace('[]', '')
                        PF.props.jsType = PF.props.jsType.replace('[]', '')
                        PF.props.dbType = PF.props.dbType.replace('[]', '')
                        PF.optional = 'array'
                      }

                      for (
                        let keys = FR.keys, refs = FR.references, i = 0;
                        i < keys.length;
                        i++
                      ) {
                        const tblF = FT.columns[keys[i]],
                          relF = PT.columns[refs[i]]
                        if (tblF) {
                          tblF.type = relF.type
                          tblF.props.jsType = relF.props.jsType
                          tblF.optional = FF.optional
                          tblF.props.dbType = relF.props.dbType
                        } else {
                          FT.columns[keys[i]] = {
                            name: keys[i],
                            map: '',
                            optional: FF.optional,
                            jsName: keys[i],
                            dbName: keys[i],
                            props: {
                              jsType: relF.props.jsType,
                              dbType: relF.props.dbType,
                            },
                            type: relF.type,
                          }
                          if (
                            !FT.columns[keys[i]].props.isId &&
                            ['SERIAL2', 'SERIAL4', 'SERIAL8'].includes(
                              relF.props.dbType
                            )
                          ) {
                            FT.columns[keys[i]].props.dbType = {
                              SERIAL2: 'INT2',
                              SERIAL4: 'INT4',
                              SERIAL8: 'INT8',
                            }[relF.props.dbType]!
                          }
                        }
                      }
                    }

                    if (col.props.foreign) addForeign(relTbl, relCol, tbl, col)
                    else if (relCol.props.foreign)
                      addForeign(tbl, col, relTbl, relCol)
                  }

                  if (
                    !(
                      relTbl.dbName === tbl.dbName &&
                      relCol.dbName === col.dbName
                    ) &&
                    relTyp[1] === tblName &&
                    ((relTyp[2] === col.name && typ[2] === relCol.name) ||
                      (!relTyp[2] && !typ[2]))
                  ) {
                    modify()
                    break
                  }
                }
                if (!col.props.dbType)
                  throw `表：${tblName}, 字段：${col.name}, 没有匹配到对向表的关系字段：${col.type}`
              }
            }
        }
      }
    }

    IterFill(db)
    // 处理关系字段,将关系表对应到字段
    IterRelate(db)
  }
  fs.writeFileSync(
    'ast.ts',
    'var a = ' +
      JSON.stringify(
        dbs.erp,
        (k, v) => {
          if (typeof v === 'bigint') v = v + 'n'
          else if (Array.isArray(v)) {
          }
          return v
        },
        2
      ),
    'utf-8'
  )

  for (const k in dbs) {
    if (dbs[k].kind === 'namespace') {
      DbConfig(<DbVar>dbs[k])
      Perfect((<DbVar>dbs[k]).models, k)
    }
  }
  // 将enum迁移到根命名空间，数据库变为：k：tableLike形式
  const rtn = { ...schm, enums: {}, dbs: {} }

  const IterDbs = (models: DbModels | Models) =>
    Object.keys(models).reduce((_, k) => {
      if ('namespace' === models[k].kind) {
        _[k] = IterDbs((<Namespace>models[k]).models)
      } else if ('enum' === models[k].kind) {
        rtn.enums[(<Enum>models[k]).jsName] = <Enum>models[k]
        delete models[k]
      } else {
        _[k] = models[k]
      }
      return _
    }, {})

  const dbsTmp = IterDbs(dbs)

  for (const k in dbsTmp) {
    if (dbsTmp[k].kind === 'table') continue
    rtn.dbs[k] = { config: {}, tables: {} }
    for (const k2 in dbsTmp[k]) {
      if ('$' === k2) rtn.dbs[k].config = dbsTmp[k][k2]
      else rtn.dbs[k].tables[k2] = dbsTmp[k][k2]
    }
  }

  return <Ast>rtn
}

export default async function (acaDir: '.' | '..', content?: string) {
  const resolveAcaDir = path.resolve(acaDir)
  if (!content) {
    const config: Config = require(path.join(resolveAcaDir, Cst.AcaConfig))
    content = fs.readFileSync(
      path.join(resolveAcaDir, Cst.AcaDir, config.orm),
      'utf-8'
    )
  }

  const ast: ts.SourceFile = ts.createSourceFile(
    '',
    <string>content,
    ts.ScriptTarget.ES2020,
    false
  )
  const pickModel = await PickModel(acaDir, ast)

  fs.writeFileSync(
    'ast.ts',
    'var a = ' +
      JSON.stringify(
        pickModel,
        (k, v) => {
          if (typeof v === 'bigint') v = v + 'n'
          else if (Array.isArray(v)) {
          }
          return v
        },
        2
      ),
    'utf-8'
  )

  return pickModel
}
