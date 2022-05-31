/// <reference types="../../types" />
import path from 'path'
import * as Cst from '../constant'
import SqlDiff from '../sql-diff'
export * from './index-koa'
export * from './api-placeholder'
export * from './react-page'

export const classHeadClient = (dbVar: string) => `\n
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
export const transactionClient = (queries: string) => `async transaction() {

  return {
    async commit() {},
    async rollback() {},
    isCompleted() {},
    ${queries}
}
}
`

export const pkgServer = (name: string, drivers: string[]) => {
  return `
{
  "name": "${name}",
  "description": "",
  "scripts": {
    "start": "node dist/index.js",
    "dev": "ts-node src/index"
  },
  "dependencies": {
    "koa": "",
    "koa-body": "",
    "koa-cors": "",
    ${drivers.map((v) => `${SqlDiff(<any>v).keyword.npm}`).join('\n')}
    "cuid": "",
    "uuid": "",
    "knex": ""
  },
  "devDependencies": {
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
export const classFooterClient = (dbVar: string) => `\n$ = {
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
  ${sqlDiff.keyword.stmt.additionalConnectOpts}
  connection: ${sqlDiff.keyword.stmt.connectionOpts}
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

export const createdEcho = (name: string) => `
$ cd ${name}
1. 打开.aca/config.json文件进行配置:
${path.resolve(name, Cst.AcaConfig)}
  
2. 在当前目录下创建服务器端应用(至少需要创建一个)、客户端应用：
  创建服务器端koa应用：
$ aca server [dirname]

  创建客户端react应用(调用create-react-app创建)：
$ aca client [dirname]

  添加自建应用(自建应用的目录必须在aca项目目录下，需先创建好)：
$ aca add [dirname]

3. 生成数据库架构及api：
$ aca up
以后在orm发生变化时使用该命令更新数据库架构及api
`

export const createdEchoServer = () => `
运行：aca up，或：aca rollback 回滚
`

export function apiIndexClient(dbs: string[], RPCs: string[]) {
  const apiStr = (arr: string[]) =>
    arr
      .map(
        (v) => `$.${v} = new $Request(fetch, url, requestInit)
$.${v}.reqIntercept = (args: $ApiBridge) => {
  // $.${v}.requestInit = requestInit
}
$.${v}.resIntercept = (rtn: any) => {
  // Process the return value rtn as required
}
`
      )
      .join('\n\n')

  return `// This file can be modified as needed, and can be used by importing this file in other pages
// This file is generated only once. Deleting this file will regenerate it
import { $, $Request, $ApiBridge } from './aca'

/***************************************************************** */
// Fill in the address of the back-end server.
// Note: when deploying to the production environment, it must be changed to the address of the production environment
const url = 'http://localhost:8080'

// Depending on the runtime environment, comment on one of the lines. 
const fetch = window.fetch.bind(window)
// Node.js environment requires you to install node-fetch yourself
// const fetch = require('node-fetch')

const headers = {
  'Content-Type': 'application/json',
}

const requestInit: RequestInit = {
  method: 'post',
  mode: 'cors',
  headers: headers,
}

// The request header and input parameter args can be overwritten
${apiStr(dbs)}
${apiStr(RPCs.map((v) => `$RPC.${v}`))}
export type { $EnumType, $TbOper, $TB } from './aca'
export { $RPC, ${dbs.join(', ')} } from './aca'
`
}

export const aggregateCount = (table: string, query: string) => `{
  select: ${
    query == 'count' ? `'*' | ` : ''
  }{ [K in $ScalarColumns<'${table}'>]: K }[$ScalarColumns<'${table}'>]
  where?: NonNullable<$TableQuery<'${table}'>['aggregate']>['where']
  sql?: NonNullable<$TableQuery<'${table}'>['aggregate']>['sql']
}`

export const reqInstTpl = (fnStr: string, dbStr: string) => `export const $ = {
  $RPC: {
      ${fnStr}
    },
      ${dbStr}
  }
  `

export const fnTpl = (fnApis: string) =>
  fnApis.trim()
    ? `export namespace $RPC {
    ${fnApis}
  }`
    : `export const $RPC = '当前没有远程函数被生成'`

export const reqInitValueTpl = `{
  req(args: any) {
    return <any>{}
  },
  requestInit: {},
  reqIntercept(args: $ApiBridge) {},
  resIntercept(rtn: any) {},
}`
