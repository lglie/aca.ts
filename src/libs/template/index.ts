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
    ${drivers.map((v) => `${Cst.Drivers[v]}`).join('\n')}
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
const url = 'http://localhost:8080'

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
