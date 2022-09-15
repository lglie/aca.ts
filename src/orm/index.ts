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

// Parse qualified name
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

// Parse node attribute
const NodeParse = {
  type(typ: ts.TypeNode): string {
    // Is array type
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
        console.log(`Data type not handled: `, JSON.stringify(typ, null, 2))
    }
    return rtn
  },
  initializer(exp: ts.Expression): Initializer {
    let rtn, text
    switch (exp.kind) {
      case ts.SyntaxKind.TrueKeyword: // is true
      case ts.SyntaxKind.FalseKeyword: // is false
        rtn = {
          type: 'boolean',
          initializer: {
            [ts.SyntaxKind.TrueKeyword]: true,
            [ts.SyntaxKind.FalseKeyword]: false,
          }[exp.kind],
        }
        break
      case ts.SyntaxKind.NumericLiteral: // is numeric literal
        text = (<ts.NumericLiteral>exp).text
        rtn = {
          type: text.indexOf('.') === -1 ? 'int' : 'float',
          initializer: text,
        }
        break
      case ts.SyntaxKind.BigIntLiteral: // is bigint literal
        rtn = {
          type: 'bigint',
          initializer: `${(<ts.BigIntLiteral>exp).text.replace(/n$/, '')}`,
        }
        break
      case ts.SyntaxKind.StringLiteral: // is string literal
        rtn = {
          type: 'string',
          initializer: `${(<ts.StringLiteral>exp).text}`,
        }
        break
      case ts.SyntaxKind.PropertyAccessExpression: // is enumeration value
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
      case ts.SyntaxKind.ObjectLiteralExpression: // is object
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
      case ts.SyntaxKind.Identifier: // is identifier
        rtn = {
          type: 'Identifier',
          initializer: `'${(<ts.Identifier>exp).text}'`,
        }
        break
      case ts.SyntaxKind.CallExpression: // is function expression
      case ts.SyntaxKind.NewExpression: // is instance expression
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
        console.log(
          `Default values not processed: ${JSON.stringify(exp, null, 2)}`
        )
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
        case ts.SyntaxKind.Identifier: //no namespace, no parameter
          key = (<ts.Identifier>exp).text
          value = true
          break
        case ts.SyntaxKind.PropertyAccessExpression: // with first-level namespace, no parameter
          key = (<ts.PropertyAccessExpression>exp).name.text
          value = true
          break
        case ts.SyntaxKind.CallExpression: // with first-level namespace and parameters
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
            // is simgle element
            if ((<ts.Identifier>v2).text) {
              return (<ts.Identifier>v2).text
            } // is array parameter
            else if ((<ts.ArrayLiteralExpression>v2).elements) {
              return (<ts.ArrayLiteralExpression>v2).elements.map(
                (v3) => (<ts.Identifier>v3).text
              )
            } // is object parameter
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
        case ts.SyntaxKind.ImportDeclaration: // is import statement
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
        case ts.SyntaxKind.VariableStatement: // is variable statement
          const varV = <ts.VariableStatement>v
          const names = varV.declarationList.declarations.reduce((_2, v2) => {
            const namesRtn = {
              name: (<ts.Identifier>v2.name).text,
              type: '',
              initializer: '',
            }
            // Have initial values
            if (v2.initializer) {
              const init = NodeParse.initializer(v2.initializer)
              if ('$db' === (<any>v2.type)?.typeName.text) {
                namesRtn.name = '$'
                namesRtn.initializer = init.initializer
              }

              // There are types, overriding the above types
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
        case ts.SyntaxKind.ModuleDeclaration: // module declaration
          const moduleV = <ts.ModuleDeclaration>v
          name = moduleV.name.text
          _[name] = {
            kind: 'namespace',
            name,
            namespace: namespace.slice(1) || [],
            models: Iter(<ts.ModuleBlock>moduleV.body, [...namespace, name]),
          }
          break
        case ts.SyntaxKind.EnumDeclaration: // is enum declaration
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
        case ts.SyntaxKind.ClassDeclaration: // is table declaration
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
            // Handle initial values
            let init
            if (V2.initializer) {
              init = NodeParse.initializer(V2.initializer)
              col['props']['default'] = init.initializer
              col.optional = 'optional'
            }
            // Handle type definition
            if (V2.type) {
              col['type'] = NodeParse.type(V2.type)
              const idType = col['type'].match(/^id(\[\w+\])?$/)
              if (idType) {
                col['props'].isId = true
                // body['id'] = col.name
              }
            }
            // If the data type is not defined, infer from the initial values
            else {
              if (!init) throw `field '${colKey}', data type is not defined`
              col['type'] = init.type
            }
            _2[colKey] = col
            return _2
          }, {})
          _[name] = body
          break
        default:
          console.log(
            `Data type is not supported by schema: ${JSON.stringify(v)}`
          )
      }
      return _
    }, {})
  }

  const dbs: DbModels = Iter(ast)

  // Find the configuration information of the database correspondong to variable kD
  const DbConfig = (db: DbVar) => {
    // Using by default the database field(.)in config as an instantiation
    if (!db.models['$']) {
      if (config.databases) {
        db.models['$'] = <DbConfig>config.databases['default']
      } else
        throw `There is no configuration database instantiation parameter in config file`
    } // Point to a field path on config/database
    else {
      const confName = db.models['$']['$']
      if (typeof confName === 'string') {
        db.models['$'] = config?.databases[confName] || confName
      } else if (typeof confName === 'object') {
        db.models['$'] = confName
      } else `Database initialization parameter configuration error！`
    }
  }

  // Perfect table
  const Perfect = (db: Models, dbVar: string) => {
    // Find table or enumeration
    const findModel = (namespace: string[], relName: string) => {
      let rtn
      if (!relName) throw `Type definition: ${relName} not found`
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
        rtn = rtn || dbs[relName] // Is the enumeration type in the root directory
      } // Contain namespace qualifiers
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

      if (!rtn) throw `Type definition: ${relName} not found`

      return <Model>rtn
    }

    const driver = (<DbConfig>(<DbVar['models']>db)['$']).connectOption.driver
    const sqlDiff = SqlDiff(driver)
    const IterFill = (subModels: Models) => {
      for (const k in subModels) {
        // jsType、dbType、id of scalar field
        switch (subModels[k].kind) {
          case 'namespace':
            IterFill((<Namespace>subModels[k]).models)
            break
          case 'view':
            break
          case 'table':
            // Get the database engine corresponding to the variable
            const tbl = <Table>subModels[k]
            // If there is a base class, fill the fields in the base class into the table
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
                  ) // May be an array
                  col.props.dbType =
                    col.props.dbType ||
                    col.type.replace(
                      typ[1],
                      sqlDiff.keyword.scalarType[typ[1]].dbType
                    )
                  break
                case 'enum':
                  break
                // enumeration type or table relationship type, add a foreign key field, and establish a relationship field
                default:
                  // Find the definiton of the enumeration or class
                  const relModel = findModel(tbl.namespace, typ[1])
                  switch ((<Model>relModel).kind) {
                    case 'enum': // is enumeration
                      col.type = 'enum'
                      col.props.dbType = 'varchar(20)'
                      col.props.jsType = (<Enum>relModel).jsName
                      break
                    case 'table': // is relation, first complete the fully qualified name of the type
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
                // Find relation table
                const relTbl = <Table>findModel(tbl.namespace, typ[1])
                for (const relK2 in relTbl.columns) {
                  const relCol = relTbl.columns[relK2]
                  const relTyp = relCol.type.match(typeReg)!
                  // Modify type, add foreign key
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

                    // Add foreign key field
                    const addForeign = (
                      PT: Table, // primary key table
                      PF: Column, // primary key field
                      FT: Table, // foreign key table
                      FF: Column // foreign key field
                    ) => {
                      let FR = FF.props.foreign
                      // If FR is a string or a string array, use the id of primary key by default
                      if (typeof FR === 'string' || Array.isArray(FR)) {
                        const tmpFR = {
                          keys: <string[]>[],
                          references: <string[]>[],
                        }
                        tmpFR.keys = typeof FR === 'string' ? [FR] : FR
                        if (PT.id.length === tmpFR.keys.length)
                          tmpFR.references = PT.id
                        else
                          throw `The foreign key does not match the length of the referenced primary key: ${FR}`
                        FR = FF.props.foreign = tmpFR
                      }
                      // If it is a one-to-many relationship, set the corresponding field optional of the key table to: array
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
                              foreign: {
                                ...FR,
                                jsType: FF.props.jsType
                              }
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
                  throw `table '${tblName}', field '${col.name}' do not match the relation field in opposite table: ${col.type}`
              }
            }
        }
      }
    }

    IterFill(db)
    // Process relational field and map relational table to field
    IterRelate(db)
  }
  // fs.writeFileSync(
  //   'ast.ts',
  //   'var a = ' +
  //     JSON.stringify(
  //       dbs.erp,
  //       (k, v) => {
  //         if (typeof v === 'bigint') v = v + 'n'
  //         else if (Array.isArray(v)) {
  //         }
  //         return v
  //       },
  //       2
  //     ),
  //   'utf-8'
  // )

  for (const k in dbs) {
    if (dbs[k].kind === 'namespace') {
      DbConfig(<DbVar>dbs[k])
      Perfect((<DbVar>dbs[k]).models, k)
    }
  }
  // Transfer enum to the root namespace, and the database becomes: {k: tableLike}
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
  const acaRoot = path.resolve(acaDir)
  if (!content) {
    const config: Config = require(path.join(acaRoot, Cst.AcaConfig))
    content = fs.readFileSync(
      path.join(acaRoot, Cst.AcaDir, config.orm),
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

  // fs.writeFileSync(
  //   'ast.ts',
  //   'var a = ' +
  //     JSON.stringify(
  //       pickModel,
  //       (k, v) => {
  //         if (typeof v === 'bigint') v = v + 'n'
  //         else if (Array.isArray(v)) {
  //         }
  //         return v
  //       },
  //       2
  //     ),
  //   'utf-8'
  // )

  return pickModel
}
