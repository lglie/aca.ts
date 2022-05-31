import fs from 'fs'
import path from 'path'
import ts from 'typescript'
import {
  Extractor,
  ExtractorConfig,
  ExtractorResult,
} from '@microsoft/api-extractor'
import { RPCApi, RPCNsApi } from './templates'
import generator from 'dts-generator'

export const tsParse = async (args: {
  baseDir: string
  out: string // 输出路径（含文件名）
  files: string[] //
}) => await generator(args)

// 生成远程函数前端代理
// RPCDir: 远程函数根目录绝对路径
export async function RPCProxy(serverName: string, RPCDir: string) {
  const RPCTmpdts = `__RPCTmp.d.ts`
  // 创建所有函数的index.ts文件
  createIndex(RPCDir)
  // 生成index.ts的dts临时文件
  await tsParse({ baseDir: RPCDir, out: RPCTmpdts, files: ['index.ts'] })
  // 根据dts文件生成前端函数
  const api = generate(RPCTmpdts)
  // 删除dts临时文件
  try {
    fs.rmSync(RPCTmpdts)
  } catch (e) {}

  return api

  function createIndex(root: string) {
    const exps: string[] = []
    const rootIdx = path.join(root, 'index.ts')
    let tmpIdx = ''
    if (fs.existsSync(rootIdx)) {
      tmpIdx = fs.readFileSync(rootIdx, 'utf-8')
      fs.rmSync(rootIdx)
    }
    const Iter = (d: string) => {
      if (fs.statSync(d).isDirectory()) {
        fs.readdirSync(d, 'utf-8').forEach((v) => Iter(path.join(d, v)))
      } else {
        exps.push(`export * from './${d.slice(root.length + 1, -3)}'`)
      }
    }
    Iter(root)
    const content = exps.length ? exps.join('\n') : tmpIdx
    fs.writeFileSync(rootIdx, content, 'utf-8')
  }

  function generate(dtsFile: string) {
    let rtn = ''
    const tsContent = fs.readFileSync(path.resolve(dtsFile), 'utf-8')
    const sourceFile = ts.createSourceFile(
      '',
      tsContent,
      ts.ScriptTarget.Latest
    )
    const moduleParse = (
      sub: ts.ModuleBlock | ts.ModuleBody,
      ns = <string[]>[]
    ) => {
      let rtn2 = '',
        Nd
      sub.forEachChild((node) => {
        let name = ''
        switch (node.kind) {
          case ts.SyntaxKind.VariableStatement:
          case ts.SyntaxKind.TypeAliasDeclaration:
            rtn2 += '\n' + tsContent.slice(node.pos, node.end)
            break
          case ts.SyntaxKind.ExportDeclaration:
            break
          case ts.SyntaxKind.ModuleDeclaration:
            Nd = <ts.ModuleDeclaration>node
            name = Nd.name.text
            rtn2 += RPCNsApi(
              name,
              moduleParse(<ts.ModuleBlock>Nd.body, [...ns, `'${name}'`])
            )
            break
          case ts.SyntaxKind.FunctionDeclaration:
            Nd = <ts.FunctionDeclaration>node
            name = Nd.name!.text
            const args = {
              params: tsContent
                .slice(
                  Nd.parameters[1]?.pos || Nd.parameters[0].end,
                  Nd.parameters.slice(-1)[0].end
                )
                .trim(),
              rtnType: '',
              call: <string[]>[],
            }

            args.rtnType = Nd.type
              ? tsContent.slice(Nd.type.pos, Nd.type.end).trim()
              : 'void'

            args.call = Nd.parameters
              .slice(1)
              .map((v) => (<ts.Identifier>v.name).text)
            rtn2 += RPCApi(
              serverName,
              name,
              args.params,
              args.rtnType,
              args.call.toString(),
              [...ns, `'${name}'`].toString()
            )
            break
          case ts.SyntaxKind.ImportDeclaration:
            break
          default:
            console.log(
              '没有被解析的节点：',
              node.kind,
              tsContent.slice(node.pos, node.end)
            )
        }
      })
      return rtn2
    }

    sourceFile.forEachChild((node) => {
      // 解析每一个模块声明
      if (ts.SyntaxKind.ModuleDeclaration === node.kind) {
        const Nd = <ts.ModuleDeclaration>node
        rtn += moduleParse(Nd.body)
      }
    })

    return rtn
  }
}

// 生成node package及后端对象的前端代理
export async function pkgProxy(imports: Import[]) {
  // 查找包的dts文件
  for (const v of imports) {
    // 在node_modules中查找
    if (v.from.match(/^\w+/)) {
      let file
      const dts = `node_modules/@types/${v.from}.d.ts`
      const nodeDts = `node_modules/@types/node/${v.from}.d.ts`
      const pkgJson = `node_modules/${v.from}/package.json`
      // 先搜索包本身，再搜索dts，然后再搜索nodeDts
      // 读取包的package.json文件
      if (fs.existsSync(pkgJson)) {
        const pkg = require(path.resolve(pkgJson))
        const types = pkg.types
        if (types) {
          file = fs.readFileSync(
            path.join(`node_modules/${v.from}`, types),
            'utf-8'
          )
          await tsParse({
            baseDir: path.resolve(`node_modules/${v.from}`),
            out: 'dts.d.ts',
            files: [types],
          })
        }
      } else {
        file = fs.existsSync(dts) && fs.readFileSync(dts, 'utf-8')
        if (!file) {
          file = fs.existsSync(nodeDts) && fs.readFileSync(nodeDts, 'utf-8')
        }
      }
    } else {
    }
  }
}

export function extractor() {
  const apiExtractorJsonPath: string = path.join('api-extractor.json')

  // Load and parse the api-extractor.json file
  const extractorConfig: ExtractorConfig =
    ExtractorConfig.loadFileAndPrepare(apiExtractorJsonPath)

  // Invoke API Extractor
  const extractorResult: ExtractorResult = Extractor.invoke(extractorConfig, {
    // Equivalent to the "--local" command-line parameter
    localBuild: true,

    // Equivalent to the "--verbose" command-line parameter
    showVerboseMessages: true,
  })

  if (extractorResult.succeeded) {
    console.log(`API Extractor completed successfully`)
    process.exitCode = 0
  } else {
    console.error(
      `API Extractor completed with ${extractorResult.errorCount} errors` +
        ` and ${extractorResult.warningCount} warnings`
    )
    process.exitCode = 1
  }
}
