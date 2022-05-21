/// <reference types="../../types" />
import path from 'path'
import * as Cst from '../constant'
import SqlDiff from '../sql-diff'
export * from './faas'
export * from './faas-provider'
export * from './default'
export * from './index-koa'
export * from './index-express'
export * from './api-placeholder'
export * from './react-page'

export const clientClassHead = (dbVar: string) => `\n
export const ${dbVar} =new (class {
`

export const transaction = (queries: string) => `
async transaction() {
  const trx = await this.knex.transaction()

  return {
    async commit() {
      await trx.commit()
    },
    async rollback() {
      await trx.rollback()
    },
    isCompleted() {
      trx.isCompleted()
    },
    ${queries}
}
}
`

export const serverPkg = (
  name: string,
  drivers: string[],
  framework: 'koa' | 'express' | 'faas'
) => {
  const Drivers = {
    pg: `"pg": "",`,
    mysql: `"mysql": "",`,
    betterSqlite3: `"better-sqlite3": "",`,
  }

  const Framework = {
    koa: {
      script: `"start": "node dist/index.js",`,
      dep: `"koa": "",
    "koa-body": "",
    "koa-cors": "",`,
      dev: ``,
      run: 'index',
    },
    express: {
      script: `"start": "node dist/index.js",`,
      dep: `"express": "",`,
      dev: ``,
      run: `index`,
    },
    faas: {
      script: ``,
      dep: ``,
      dev: `"koa": "",
    "koa-body": "",
    "koa-cors": "",`,
    },
    run: `.dev-serve`,
  }[framework]

  return `
{
  "name": "${name}",
  "description": "",
  "scripts": {
    ${Framework.script}
    "dev": "ts-node src/${Framework.run}"
  },
  "dependencies": {
    ${Framework.dep}
    ${drivers.map((v) => `${Drivers[v]}`).join('\n')}
    "cuid": "",
    "uuid": "",
    "knex": ""
  },
  "devDependencies": {
    ${Framework.dev}
    "@types/node": ""
  }
}
`
}

// 表查询接口模板
export const tableQuery = (query, tblName) => `{
  const trx = await this.knex.transaction()
  try {
    const rtn = await $Handle( trx )({ query: '${query}', table: '${tblName}', args })
    await trx.commit()
    return rtn
  } catch (err) {
    await trx.rollback()
    return { error: err.toString() }
  }
} `

//  前端尾部模板
export const classClientFooter = (dbVar: string) => `\n$ = {
    raw: async (args: string): Promise<{ data?: unknown; error?: string }> =>
    await $.${dbVar}.req({
      kind: 'raw',
      dbVar: '${dbVar}',
      args,
    }),
  }
})()`

// sql raw 后端模板
export const sqlRawServer = (dbVar) => `\n$ = {
  raw: async (args: string): Promise<{ data?: unknown; error?: string }> => {
    const trx = await this.knex.transaction()
    try {
      const data = (await trx.raw(args)).rows
      await trx.commit()
      // 去掉字符串前后的空白
      for (const v of data) {
        for (const k in v) {
          if (typeof v[k] === 'string') v[k] = v[k].trim()
        }
      }
      return { data }
    } catch (e) {
      await trx.rollback()
      return { error: e.toString() }
    }
  },
}
`

// 后端构造函数
export const constructor = (config: DbConfig) => {
  const driver = config.connectOption.driver
  const sqlDiff = SqlDiff(driver)

  return `
private knex: Knex < any, unknown[] >
  constructor() {
  const driver = '${sqlDiff.keyword.fullName}'
  let connection = process.env['${
    config.connectOption.envConnect || ''
  }'] || ${JSON.stringify(config.connectOption.connect, null, 2)}

try {
  if (typeof connection == 'string') connection = JSON.parse(connection)
} catch (e) { }

this.knex = knex({
  client: driver,
  ${
    driver === 'pg'
      ? `pool: {
    min: 2,
    max: 6,
    propagateCreateError: false,
  },`
      : ''
  }
  connection: ${
    {
      pg: `typeof connection == 'string' ? require('pg-connection-string').parse(connection) : connection`,
      mysql: `connection`,
      betterSqlite3: `connection`,
    }[driver]
  }${driver === 'betterSqlite3' ? ',\nuseNullAsDefault: false,' : ''}
})
}
`
}

// 远程函数前端代理模板
export const RPCApi = (
  apiDir: string,
  name: string,
  params: string,
  rtnType: string,
  call: string,
  fn: string
) => `
export async function ${name} (${params}): ${
  rtnType.startsWith('Promise<') ? rtnType : `Promise<${rtnType}>`
} {
  return await $.$RPC.${apiDir}.req({
    kind: 'rpc',
    method: [${fn}],
    args: [${call}],
  })
} `

// 远程函数命名空间前端代理模板
export const RPCNsApi = (name, body) => `
export namespace ${name} {
  ${body}
} `

export const apiBridge = (dbs: string[]) => `\n
export async function $ApiBridge(context: unknown, reqBody: $ApiBridge) {
  switch (reqBody.kind) {
    case 'rpc':
      return await reqBody.method.reduce((_: any, v: string) => _[v], $RPC)(
        context,
        ...(reqBody.args || [])
      )
    case 'orm':
      return await reqBody.method
        .reduce((_, v) => _[v], { ${dbs.toString()} }[reqBody.dbVar])
        [reqBody.query](reqBody.args)
    case 'raw':
      return await { ${dbs.toString()} }[reqBody.dbVar].$.raw(reqBody.args)
  }
}
`
// orm变更摘要
export const remark = (date, comment) => ({
  date: new Date(date).toLocaleString(),
  id: date,
  comment,
})

const Faas = {
  lambda: `main_handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false
    const acaReq = await $ApiBridge(context, JSON.parse(event.body))`,
}

export const serverIndex = (
  faas: keyof typeof Faas
) => `import { $ApiBridge } from './api'

export const ${Faas[faas]}

  return acaReq
}
`

export const createdEcho = (name: string) => `
$ cd ${name}
1. 打开.aca/config.json文件进行配置:
${path.resolve(name, Cst.AcaConfig)}
  
2. 在当前目录下创建服务器端应用(至少需要创建一个)、客户端应用：
创建服务器端应用使用命令：
$ aca server [dirname] --framework <framework or faas> (framework：koa, express, faas:amazon, azure, ali, tencent)
创建客户端应用使用命令, 内部调用create-react-app创建一个react应用：
$ aca client [dirname]

3. 生成数据库及api：
$ aca up
以后在orm发生变化时使用该命令更新数据库架构及api
`

export const serverCreatedEcho = () => `
运行：aca up，或：aca rollback 回滚
`

export function clientApiIndex(dbs: string[], RPCs: string[]) {
  const apiStr = (arr: string[]) =>
    arr
      .map(
        (v) => `$.${v} = new $Request(url, requestInit)
$.${v}.reqIntercept = (args: $ApiBridge) => {
  // $.${v}.requestInit = requestInit
}
$.${v}.resIntercept = (rtn: any) => {
  // 根据需要对返回值：rtn 进行处理
}
`
      )
      .join('\n\n')

  return `// 此文件为模板文件，实际根据需要编写，在其他页面中引入这个文件即可使用
// 本文件只生成一次，只有删除该文件会重新生成
import { $, $Request, $ApiBridge } from './aca'

// 填写后端服务器的地址，注意：部署到生产环境时，一定要改成生产环境的地址
/*******************************下面这些根据需要自行填写************************ */
const url = ''

const headers = {
  'Content-Type': 'application/json',
}

const requestInit: RequestInit = {
  method: 'post',
  mode: 'cors',
  headers: headers,
}

// 可以对请求头进行及入参：args进行改写
${apiStr(dbs)}
${apiStr(RPCs.map((v) => `$RPC.${v}`))}
export type { $EnumType, $TableType, $TB } from './aca'
export { $RPC, ${dbs.join(', ')} } from './aca'
`
}
