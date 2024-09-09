/// <reference types="../types" />

import fs from 'fs'
import path from 'path'
import * as Cst from '../libs/constant'
import { currentDir } from '../libs/common'
import { CreateAllTblSqls, DbDiffSqls } from '../libs/database'
import SqlDiff from '../libs/sql-diff'
import Api from '../libs/api'
import orm from '../orm'
import { remark } from '../libs/templates'

const msg = (acaDir: AcaDir, config: Config) => {
  const resolveAcaDir = path.resolve(acaDir)
  const serverApps = Object.keys(config.serverApps)
  console.log(`\nThe generated backend files are stored in: `)
  for (const v of serverApps) {
    const apiDir =
      config.serverApps[v].apiDir ??
      path.join(Cst.DefaultTsDir, Cst.DefaultServerApiDir)
    console.log(path.join(resolveAcaDir, v, apiDir, Cst.ApiIndex))
  }
  const clientApps = Object.keys(config.clientApps)
  if (clientApps.length) {
    console.log(
      `\nOpen the file below and configure url and headers required in frontend:`
    )
    for (const v of clientApps) {
      const apiDir =
        config.clientApps[v].apiDir ??
        path.join(Cst.DefaultTsDir, Cst.DefaultClientApiDir)
      console.log(path.join(resolveAcaDir, v, apiDir, Cst.ClientApiIndex))
    }
  }
}

async function pg(
  acaDir: AcaDir,
  config: Config,
  timestamp,
  currdb: Db,
  prevDb?: Db
) {
  const sqlDiff = SqlDiff('pg')

  // Determine if the database exists
  const connConf =
    process.env[currdb.config.connectOption.envConnect || ''] ||
    currdb.config.connectOption.connect
  const connOption = <RelConn>(
    (typeof connConf === 'string'
      ? require(path.resolve('node_modules/pg-connection-string')).parse(
          connConf
        )
      : connConf)
  )

  let db = await sqlDiff.keyword.stmt.connect(acaDir, config, connOption)

  const CreateDb = async () => {
    if (db.database !== 'postgres')
      throw new Error(
        `Database ${connOption.database} already exists. Delete the database first to recreate'`
      )
    console.log(`Creating database tables...`)
    const allSql = CreateAllTblSqls(currdb.config, currdb.tables)
    allSql.sqls =
      sqlDiff.aca.create + sqlDiff.aca.insert(timestamp) + '\n' + allSql.sqls
    console.log(allSql.sqls)
    try {
      // Create new database
      await db.query(sqlDiff.db.create(connOption.database))
      await db.end()
      db = await sqlDiff.keyword.stmt.connect(acaDir, config, connOption)
      await db.query(allSql.sqls)
      await db.end()
      console.log(`total: ${allSql.total} created!`)
    } catch (e) {
      // Delete the new database if not successful
      await db.end()

      db = await sqlDiff.keyword.stmt.connect(acaDir, config, {
        ...connOption,
        database: 'postgres'
      })
      await db.query(`DROP DATABASE "${connOption.database}"`)
      await db.end()
      throw e
    }
    return allSql.sqls
  }

  const AlterDb = async () => {
    try {
      // Determine if the database is created by aca (through aca-specific system table: "___ACA")
      await db.query(sqlDiff.aca.select)
    } catch (e) {
      await db.end()
      throw `Database "${
        (<any>connOption).database
      }" exists, please backup and delete first`
    }
    const allSqls = DbDiffSqls(currdb, prevDb)

    if (allSqls) {
      console.log(allSqls)
      try {
        await db.query(allSqls)
      } catch (e) {
        throw e
      } finally {
        await db.end()
      }
      console.log(`Database(${connOption}) updated successfully!`)
      return allSqls
    } else {
      await db.end()
    }
  }

  return await (prevDb ? AlterDb() : CreateDb())
}

async function mssql(
  acaDir: AcaDir,
  config: Config,
  timestamp,
  currdb: Db,
  prevDb?: Db
) {
  const sqlDiff = SqlDiff('mssql')

  // Determine if the database exists
  const connConf =
    process.env[currdb.config.connectOption.envConnect || ''] ||
    currdb.config.connectOption.connect
  const connOption = <RelConn>connConf
  let db = await sqlDiff.keyword.stmt.connect(acaDir, config, connOption)

  const CreateDb = async () => {
    if (db.config.database !== 'master')
      throw new Error(
        `Database ${connOption.database} already exists. Delete the database first to recreate'`
      )
    console.log(`Creating database tables...`)
    const allSql = CreateAllTblSqls(currdb.config, currdb.tables)
    allSql.sqls =
      sqlDiff.aca.create + sqlDiff.aca.insert(timestamp) + '\n' + allSql.sqls
    console.log(allSql.sqls)
    try {
      // Create new database
      await db.query(sqlDiff.db.create(connOption.database))
      await db.close()
      db = await sqlDiff.keyword.stmt.connect(acaDir, config, connOption)
      await db.query(allSql.sqls)
      await db.close()
      console.log(`Total: ${allSql.total} tables created successfully！`)
    } catch (e) {
      // Delete the new database if not successful
      db = await sqlDiff.keyword.stmt.connect(acaDir, config, {
        ...connOption,
        database: 'master'
      })
      await db.query(`DROP DATABASE "${connOption.database}"`)
      await db.close()
      throw e
    }
    return allSql.sqls
  }

  const AlterDb = async () => {
    try {
      // Determine if the database exists
      await db.query(sqlDiff.aca.select)
    } catch (e) {
      await db.close()
      throw `Database "${
        (<any>connOption).database
      }" exists, please back up and delete first`
    }

    const allSqls = DbDiffSqls(currdb, prevDb)

    if (allSqls) {
      console.log(allSqls)
      try {
        await db.query(allSqls)
      } catch (e) {
        throw e
      } finally {
        await db.close()
      }
      console.log(`Database(${connOption}) updated successfully!`)
      return allSqls
    } else {
      await db.close()
    }
  }

  return await (prevDb ? AlterDb() : CreateDb())
}

async function mysql2(
  acaDir: AcaDir,
  config: Config,
  timestamp,
  currdb: Db,
  prevDb?: Db
) {
  const sqlDiff = SqlDiff('mysql2')
  // Determine if the database exists
  const conn = <RelConn>(
    (process.env[currdb.config.connectOption.envConnect || ''] ||
      currdb.config.connectOption.connect)
  )

  let db = await sqlDiff.keyword.stmt.connect(acaDir, config, conn)

  const CreateDb = async () => {
    if (db.connection.database === (<RelConn>conn).database)
      throw new Error(
        `Database: ${
          (<RelConn>conn).database
        }already exists, delete the database first to recreate`
      )
    console.log(`Creating database tables...`)
    const allSql = CreateAllTblSqls(currdb.config, currdb.tables)
    allSql.sqls =
      sqlDiff.aca.create + sqlDiff.aca.insert(timestamp) + '\n' + allSql.sqls
    console.log(allSql.sqls)

    try {
      // Create new database
      await db.query(sqlDiff.db.create((<RelConn>conn).database))
      await db.end()
      db = await sqlDiff.keyword.stmt.connect(acaDir, config, conn)
      await db.query(allSql.sqls)
      await db.end()
      console.log(`Total: ${allSql.total} tables are created successfully!`)
    } catch (e) {
      db = await sqlDiff.keyword.stmt.connect(acaDir, config, {
        ...(<RelConn>conn),
        database: undefined
      })
      await db.query(sqlDiff.db.drop((<RelConn>conn).database))
      await db.end()
      throw e
    }
    return allSql.sqls
  }

  const AlterDb = async () => {
    try {
      // Determine if the database is created by aca (through aca-specific system table: "___ACA")
      await db.query(sqlDiff.aca.select)
    } catch (e) {
      await db.end()
      throw `Database "${
        (<RelConn>conn).database
      }" exists, please back up and delete first`
    }

    const allSqls = DbDiffSqls(currdb, prevDb)

    if (allSqls) {
      console.log(allSqls)
      try {
        await db.query(allSqls)
      } catch (e) {
        throw e
      } finally {
        await db.end()
      }
      console.log(
        `Database(${(<RelConn>conn).database}) updated successfully！`
      )
      return allSqls
    } else {
      await db.end()
    }
  }

  return await (prevDb ? AlterDb() : CreateDb())
}

async function sqlite3(
  acaDir: AcaDir,
  config: Config,
  timestamp,
  currdb: Db,
  prevDb?: Db
) {
  const app = Object.keys(config.serverApps)[0]
  if (!app)
    throw new Error(
      `Need to create at least one server-side app, or add an app to register in config.json: aca add [dirname] -s`
    )
  const sqlDiff = SqlDiff('sqlite3')
  const connConf =
    process.env[currdb.config.connectOption.envConnect || ''] ||
    currdb.config.connectOption.connect
  const connOption: SqliteConn =
    typeof connConf === 'string' ? { filename: connConf } : <SqliteConn>connConf

  const CreateDb = async () => {
    // Determine if the database exists
    if (fs.existsSync(path.join(acaDir, app, connOption.filename))) {
      throw new Error(
        `Database: ${connOption.filename} already exists, please delete this database to recreate`
      )
    }
    console.log(`Creating database tables......`)
    const db: any = sqlDiff.db.createSqliteDb(acaDir, config, connOption)
    const allSql = CreateAllTblSqls(currdb.config, currdb.tables)
    allSql.sqls =
      sqlDiff.aca.create +
      sqlDiff.aca.insert(timestamp) +
      '\n' +
      allSql.sqls +
      ';'
    console.log(allSql.sqls)
    try {
      await new Promise((resolve, reject) => {
        db.exec(allSql.sqls, function (err) {
          if (err) {
            reject(err)
          } else {
            resolve(true)
          }
        })
      })
      db.close()
      console.log(`Total: ${allSql.total} tables created successfully！`)
    } catch (e) {
      // Unsuccessful, delete the new database
      db.close()
      fs.rmSync(path.join(acaDir, app, connOption.filename))
      throw e
    }

    return allSql.sqls
  }

  const AlterDb = async () => {
    const db: any = await sqlDiff.keyword.stmt.connect(
      acaDir,
      config,
      connOption
    )
    try {
      // Determine if the database is created by aca (through aca-specific system table: "___ACA")
      let upedSchs = db.prepare(sqlDiff.aca.select).all()
    } catch (e) {
      throw `Database"${
        (<any>connOption).filename
      }" already exists, or has been recorded by aca up, please back up and delete first`
    }
    const allSqls = DbDiffSqls(currdb, prevDb)
    if (allSqls) {
      console.log(allSqls)
      try {
        await new Promise((resolve, reject) => {
          db.exec(allSqls, function (err) {
            if (err) {
              reject(err)
            } else {
              resolve(true)
            }
          })
        })
      } catch (e) {
        console.log(e)
        throw e
      }
      console.log(`Database(${connOption.filename}) updated successfully！`)
      return allSqls
    }
  }

  return await (prevDb ? AlterDb() : CreateDb())
}

export async function up(yargs: any) {
  const currDir = currentDir()
  if (!currDir)
    throw new Error(
      `Current directory is not an aca project directory. Please move to the project directory or the app directory under the project to run the command`
    )
  const acaDir = currDir === '.' ? '.' : '..'
  const acaRoot = path.resolve(acaDir)
  const config: Config = require(path.join(acaRoot, Cst.AcaConfig))
  if (!config.databases) {
    throw new Error('No database config found in config.ts')
  }
  config.orm = []
  for (const key in config.databases) {
    const dbConfig = config.databases[key]
    if (dbConfig.connectOption.driver === 'sqlite3') {
      const ormName = dbConfig.connectOption.connect.filename.slice(0, -8)
      config.orm.push(ormName)
    } else {
      const ormName = dbConfig.connectOption.connect.database
      config.orm.push(ormName)
    }
  }
  const isRollback = yargs.argv['_'][0] === 'rollback' ? true : false
  const timestamp = Date.now()
  let logs = <Remark[]>require(path.join(acaRoot, Cst.AcaMiscRemark))
  let changed: string[] = [],
    rollOrm,
    ast: Ast

  if (isRollback) {
    rollOrm = logOrm(true)
    ast = await orm(acaDir, rollOrm)
  } else {
    ast = await orm(acaDir)
  }

  const dbs = ast.dbs
  // Process the previous orm
  const lastOrm = logOrm()
  const prevAst = lastOrm && (await orm(acaDir, lastOrm))
  const prevDbs = prevAst ? prevAst.dbs : {}
  for (const k in dbs) {
    if (!dbs[k].config.onlyApi) {
      const rtn = await {
        pg,
        mssql,
        mysql2,
        sqlite3
      }[dbs[k].config.connectOption.driver](
        acaDir,
        config,
        timestamp,
        dbs[k],
        prevDbs[k]
      )
      rtn ? changed.push(`### ${k}:\n\`\`\`\n${rtn}`) : ''
    }
  }

  await Api(acaDir, config, ast)

  // Write changelog
  if (changed.length) WriteLog(changed.join(`\n\n`), isRollback)
  msg(acaDir, config)
  // Read the last or last second change record (rollback)
  function logOrm(isRollback = false) {
    const [lastLog] = isRollback ? logs.slice(-2, -1) : logs.slice(-1)
    if (!lastLog) return
    const logName = lastLog.id
    let content = ''
    const Iter = (d: string) => {
      if (fs.statSync(d).isDirectory()) {
        fs.readdirSync(d, 'utf-8').forEach((v) => Iter(path.join(d, v)))
      } else {
        if (d.endsWith('.ts')) {
          content += fs.readFileSync(d, 'utf-8')
        }
      }
    }
    for (const key of config.orm) {
      const ormPath = `${acaDir}/${Cst.AcaMiscRecordsDir}/${logName}/${key}`
      if (fs.existsSync(ormPath)) {
        Iter(ormPath)
      }
    }
    return content
  }

  function WriteLog(changed: string, isRollback: boolean) {
    if (isRollback) {
      const rmk: Remark = logs.slice(-1)[0]
      deleteFolderRecursive(`${acaDir}/${Cst.AcaMiscRecordsDir}/${rmk.id}`)
      logs = logs.slice(0, -1)
      fs.writeFileSync(
        `${acaDir}/${Cst.AcaMiscRemark}`,
        JSON.stringify(logs, null, 2),
        'utf-8'
      )
      for (const name of config.orm) {
        deleteFolderRecursive(`${acaDir}/${Cst.AcaDir}/${name}`)
      }
      for (const name of config.orm) {
        copyDir(
          `${acaDir}/${Cst.AcaMiscRecordsDir}/${
            logs[logs.length - 1].id
          }/${name}`,
          `${acaDir}/${Cst.AcaDir}/${name}`
        )
      }
    } else {
      const changedDir = `${acaDir}/${Cst.AcaMiscRecordsDir}/${timestamp}`
      fs.mkdirSync(changedDir)
      for (const name of config.orm) {
        copyDir(`${acaDir}/${Cst.AcaDir}/${name}`, `${changedDir}/${name}`)
      }
      fs.writeFileSync(`${changedDir}/sql.md`, changed, 'utf-8')
      logs.push(remark(timestamp, ''))
    }
    fs.writeFileSync(
      path.join(acaDir, Cst.AcaMiscRemark),
      JSON.stringify(logs, null, 2),
      'utf-8'
    )
  }

  function copyDir(src, dest) {
    if (fs.existsSync(src)) {
      const entries = fs.readdirSync(src, {
        encoding: 'utf8',
        withFileTypes: true
      })

      fs.mkdirSync(dest, { recursive: true })

      for (let entry of entries) {
        const srcPath = path.join(src, entry.name)
        const destPath = path.join(dest, entry.name)

        if (entry.isDirectory()) {
          copyDir(srcPath, destPath)
        } else {
          fs.copyFileSync(srcPath, destPath)
        }
      }
    }
  }

  function deleteFolderRecursive(path) {
    if (fs.existsSync(path)) {
      fs.readdirSync(path).forEach((file) => {
        const curPath = path + '/' + file
        if (fs.lstatSync(curPath).isDirectory()) {
          deleteFolderRecursive(curPath)
        } else {
          fs.unlinkSync(curPath)
        }
      })
      fs.rmdirSync(path)
    }
  }
}
