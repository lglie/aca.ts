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
import { mssql, mysql2, pg, sqlite3 } from './up'

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


export async function deploy(yargs: any) {
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
  let logs = <Remark[]>require(path.join(acaRoot, Cst.AcaMiscDeployRemark))
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
      const ormPath = `${acaDir}/${Cst.AcaMiscDeployDir}/${logName}/${key}`
      if (fs.existsSync(ormPath)) {
        Iter(ormPath)
      }
    }
    return content
  }

  function WriteLog(changed: string, isRollback: boolean) {
    if (isRollback) {
      const rmk: Remark = logs.slice(-1)[0]
      deleteFolderRecursive(`${acaDir}/${Cst.AcaMiscDeployDir}/${rmk.id}`)
      logs = logs.slice(0, -1)
      fs.writeFileSync(
        `${acaDir}/${Cst.AcaMiscDeployRemark}`,
        JSON.stringify(logs, null, 2),
        'utf-8'
      )
      for (const name of config.orm) {
        deleteFolderRecursive(`${acaDir}/${Cst.AcaDir}/${name}`)
      }
      for (const name of config.orm) {
        copyDir(
          `${acaDir}/${Cst.AcaMiscDeployDir}/${
            logs[logs.length - 1].id
          }/${name}`,
          `${acaDir}/${Cst.AcaDir}/${name}`
        )
      }
    } else {
      const changedDir = `${acaDir}/${Cst.AcaMiscDeployDir}/${timestamp}`
      fs.mkdirSync(changedDir)
      for (const name of config.orm) {
        copyDir(`${acaDir}/${Cst.AcaDir}/${name}`, `${changedDir}/${name}`)
      }
      fs.writeFileSync(`${changedDir}/sql.md`, changed, 'utf-8')
      logs.push(remark(timestamp, ''))
    }
    fs.writeFileSync(
      path.join(acaDir, Cst.AcaMiscDeployRemark),
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
