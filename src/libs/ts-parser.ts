import fs from "fs";
import path from "path";
import ts from "typescript";
import {
  Extractor,
  ExtractorConfig,
  ExtractorResult,
} from "@microsoft/api-extractor";
import { RPCApi, RPCNsApi } from "./templates";
import generator from "dts-generator";

export const tsParse = async (args: {
  baseDir: string;
  out: string; // Output path(including file name)
  files: string[]; //
}) => await generator(args);

// Generate remote function frontend proxy
// RPCDir: absolute path of the root directory of the remote function
export async function RPCProxy(serverName: string, RPCDir: string) {
  // Create index.ts file for all functions
  createIndex(RPCDir);
  // // Generate dts temporary file for index.ts
  // await tsParse({ baseDir: RPCDir, out: RPCTmpdts, files: ["index.ts"] });
  // // Generate frontend function based on dts file
  // const api = generate(RPCTmpdts);
  const api = await createClientRpc(RPCDir);

  // // Delete dts temporary file
  // try {
  //   fs.rmSync(RPCTmpdts);
  // } catch (e) {}

  return api;

  async function createClientRpc(root: string) {
    const exps = {};
    const rootIdx = path.join(root, "index.ts");
    const Iter = (d: string) => {
      if (fs.statSync(d).isDirectory()) {
        fs.readdirSync(d, "utf-8").forEach((v) => Iter(path.join(d, v)));
      } else {
        if (d.endsWith("ts") && d !== rootIdx) {
          const file_name = d.replaceAll("\\", "/").slice(root.length + 1, -3);
          file_name.split("/").reduce((_, v, k) => {
            if (!_[v]) {
              _[v] = {};
            }
            if (k === file_name.split("/").length - 1) {
              _[v] = d;
            }
            return _[v];
          }, exps);
        }
      }
    };
    Iter(root);
    const geneExp = async (v) => {
      if (typeof v === "string") {
        const RPCTmpdts = `__RPCTmp.d.ts`;
        // Generate dts temporary file for index.ts
        await tsParse({ baseDir: root, out: RPCTmpdts, files: [v] });
        // Generate frontend function based on dts file
        let file_name = v.replaceAll("\\", "/").slice(root.length + 1, -3);
        if (file_name.endsWith('index')) {
          file_name = file_name.slice(0, file_name.length - 6)
        }
        const api = generate(RPCTmpdts, file_name.split("/").map(d => `'${d}'`));

        // Delete dts temporary file
        try {
          fs.rmSync(RPCTmpdts);
        } catch (e) {}
        return api;
      } else {
        return await generateE(v);
      }
    };
    const generateE = async (obj) => {
      let apit = "";
      for (const key in obj) {
        const t = await geneExp(obj[key]);
        if (key === 'index') {
          apit += `${t} \n`;
        } else {
          apit += `export namespace ${key} {\n ${t} \n}`;
        }
      }
      return apit;
    };

    return await generateE(exps);
  }
  function createIndex(root: string) {
    const imports: string[] = [];
    const exports = {};
    const rootIdx = path.join(root, "index.ts");
    let tmpIdx = "";
    if (fs.existsSync(rootIdx)) {
      tmpIdx = fs.readFileSync(rootIdx, "utf-8");
      fs.rmSync(rootIdx);
    }
    const Iter = (d: string) => {
      if (fs.statSync(d).isDirectory()) {
        fs.readdirSync(d, "utf-8").forEach((v) => Iter(path.join(d, v)));
      } else {
        if (d.endsWith("ts")) {
          const file_name = d.replaceAll("\\", "/").slice(root.length + 1, -3);
          imports.push(
            `import * as I_${file_name.replaceAll("/", "_")} from './${d
              .replaceAll("\\", "/")
              .slice(root.length + 1, -3)}'`
          );
          file_name.split("/").reduce((_, v, k) => {
            if (!_[v]) {
              _[v] = {};
            }
            if (k === file_name.split("/").length - 1) {
              _[v] = `I_${file_name.replaceAll("/", "_")}`;
            }
            return _[v];
          }, exports);
        }
      }
    };
    Iter(root);
    const geneExp = (v) => {
      if (typeof v === "string") {
        return v;
      } else {
        return generateE(v);
      }
    };
    const generateE = (obj) => {
      let tt = "{\n";
      for (const key in obj) {
        const t = geneExp(obj[key]);
        if (key === 'index') {
          tt += `...${t}, \n`
        } else {
          tt += `${key}: ${t}, \n`;
        }
      }
      tt += "}\n";
      return tt;
    };

    const impcontent = imports.length ? imports.join("\n") : tmpIdx;
    const expcontent = Object.keys(exports)
      ? Object.keys(exports)
          .map(
            (v) =>
              `export const ${v} = ${
                typeof exports[v] === "string"
                  ? exports[v]
                  : generateE(exports[v])
              }`
          )
          .join("\n")
      : "";
    fs.writeFileSync(rootIdx, impcontent + "\n" + expcontent, "utf-8");
  }

  function generate(dtsFile: string, dns: string[]) {
    let rtn = "";
    const tsContent = fs.readFileSync(path.resolve(dtsFile), "utf-8");
    const sourceFile = ts.createSourceFile(
      "",
      tsContent,
      ts.ScriptTarget.Latest
    );
    const moduleParse = (
      sub: ts.ModuleBlock | ts.ModuleBody,
      ns = <string[]>[]
    ) => {
      let rtn2 = "",
        Nd;
      sub.forEachChild((node) => {
        let name = "";
        switch (node.kind) {
          case ts.SyntaxKind.VariableStatement:
          case ts.SyntaxKind.TypeAliasDeclaration:
            rtn2 += "\n  " + tsContent.slice(node.pos, node.end);
            break;
          case ts.SyntaxKind.ExportDeclaration:
            break;
          case ts.SyntaxKind.ModuleDeclaration:
            Nd = <ts.ModuleDeclaration>node;
            name = Nd.name.text;
            rtn2 += RPCNsApi(
              name,
              moduleParse(<ts.ModuleBlock>Nd.body, [...ns, `'${name}'`])
            );
            break;
          case ts.SyntaxKind.FunctionDeclaration:
            Nd = <ts.FunctionDeclaration>node;
            name = Nd.name!.text;
            const args = {
              params: tsContent
                .slice(
                  Nd.parameters[1]?.pos || Nd.parameters[0].end,
                  Nd.parameters.slice(-1)[0].end
                )
                .trim(),
              rtnType: "",
              call: <string[]>[],
            };

            args.rtnType = Nd.type
              ? tsContent.slice(Nd.type.pos, Nd.type.end).trim()
              : "void";

            args.call = Nd.parameters
              .slice(1)
              .map((v) => (<ts.Identifier>v.name).text);
            rtn2 += RPCApi(
              serverName,
              name,
              args.params,
              args.rtnType,
              args.call.toString(),
              [...dns, ...ns, `'${name}'`].toString()
            );
            break;
          case ts.SyntaxKind.ImportDeclaration:
            break;
          default:
            console.log(
              "nodes that are not parsed",
              node.kind,
              tsContent.slice(node.pos, node.end)
            );
        }
      });
      return rtn2;
    };

    sourceFile.forEachChild((node) => {
      // Parse each module declaration
      if (ts.SyntaxKind.ModuleDeclaration === node.kind) {
        const Nd = <ts.ModuleDeclaration>node;
        rtn += moduleParse(Nd.body);
      }
    });

    return rtn;
  }
}

// Generate node package and frontend proxy of backend objects
export async function pkgProxy(imports: Import[]) {
  // Find the dts file of the package
  for (const v of imports) {
    // Find in node_modules
    if (v.from.match(/^\w+/)) {
      let file;
      const dts = `node_modules/@types/${v.from}.d.ts`;
      const nodeDts = `node_modules/@types/node/${v.from}.d.ts`;
      const pkgJson = `node_modules/${v.from}/package.json`;
      // Search the package itself first, then dts, and then nodeDts
      // Read the package.json file of the package
      if (fs.existsSync(pkgJson)) {
        const pkg = require(path.resolve(pkgJson));
        const types = pkg.types;
        if (types) {
          file = fs.readFileSync(
            path.join(`node_modules/${v.from}`, types),
            "utf-8"
          );
          await tsParse({
            baseDir: path.resolve(`node_modules/${v.from}`),
            out: "dts.d.ts",
            files: [types],
          });
        }
      } else {
        file = fs.existsSync(dts) && fs.readFileSync(dts, "utf-8");
        if (!file) {
          file = fs.existsSync(nodeDts) && fs.readFileSync(nodeDts, "utf-8");
        }
      }
    } else {
    }
  }
}

export function extractor() {
  const apiExtractorJsonPath: string = path.join("api-extractor.json");

  // Load and parse the api-extractor.json file
  const extractorConfig: ExtractorConfig =
    ExtractorConfig.loadFileAndPrepare(apiExtractorJsonPath);

  // Invoke API Extractor
  const extractorResult: ExtractorResult = Extractor.invoke(extractorConfig, {
    // Equivalent to the "--local" command-line parameter
    localBuild: true,

    // Equivalent to the "--verbose" command-line parameter
    showVerboseMessages: true,
  });

  if (extractorResult.succeeded) {
    console.log(`API Extractor completed successfully`);
    process.exitCode = 0;
  } else {
    console.error(
      `API Extractor completed with ${extractorResult.errorCount} errors` +
        ` and ${extractorResult.warningCount} warnings`
    );
    process.exitCode = 1;
  }
}
