import { Symbol } from './../../lexicon';
import * as fs from 'fs';
import * as child_process from 'child_process';
import { FunctionResolved } from '../../entity/resolved';
import { assertNever } from '../../util/classifying';


function generateParameterList(p: FunctionResolved.Parameter): string {
    const param = p.differentiate()
    if (param.kind === "NoParameter") {
        return ""
    }
    const type = param.part.UnaryParameterType.differentiate()

    switch(type.kind) {
        case "Enum":
            throw new Error(`Enum parameter types aren't actually supported`)
        case "Message":
            return `${param.name}: ${type.name}`
    }
    
}

function generateInternalFunction(f: FunctionResolved.Function): string {
    const ret = f.part.ReturnTypeSpec.differentiate()
    let returnTypeSpec = ''
    let returnStatement= ''
    if (ret.kind === "VoidReturnType") {
        returnTypeSpec = ' -> ()'
        returnStatement = ''
    } else {
        returnTypeSpec = ` -> ${ret.name}`
        returnStatement = `return ${f.part.FunctionBody.children.Statement[0].differentiate().val}`
    }

    return `
    fn internal_${f.name}(${generateParameterList(f.part.Parameter)}) ${returnTypeSpec} {
        ${returnStatement}
    }
    `
}

function generateFunctions(functions: FunctionResolved.Function[]): {def: string, func_name: string, path: string}[] {
    return functions.map(func => {

        const internal = generateInternalFunction(func) 
        const param = func.part.Parameter.differentiate()
        
        let paramStr: string = ''

        if (param.kind === "UnaryParameter") {
            const ptype = param.part.UnaryParameterType.differentiate()
            paramStr = `input: web::Json<${ptype.name}>`
        } else {
            throw new Error("No parameter functions actually aren't supported")
        }

        const returnType = func.part.ReturnTypeSpec.differentiate()
        let externalFuncBody = ''

        switch (returnType.kind) {
            case "VoidReturnType":
                externalFuncBody = `internal_${func.name}(msg);\nHttpResponse::Ok()`
                break;
            case "Enum":
                throw Error("enum return types aren't actually supported")
            case "Message":
                externalFuncBody = `let out = internal_${func.name}(msg);\nHttpResponse::Ok().json(out)`
                break;
        }
        
        const external = `
        async fn external_${func.name}(${paramStr}) -> impl Responder {
            let msg = input.into_inner();
            ${externalFuncBody}
        }
                
        `
        return {def: `${internal}\n${external}`, func_name: `external_${func.name}`, path: func.name}
    })
}

export function containerize(manifest: FunctionResolved.Manifest): string {
    const functions = generateFunctions(manifest.service.functions)
    const structs: string[] = []
    manifest.namespaces[0].inScope.forEach(val => {
        switch (val.kind) {
            case "Function":
                break;
            case "Message":
                structs.push(`
                    #[derive(Serialize, Deserialize)]
                    struct ${val.name} {
                        ${val.children.Field.map(field => {
                            const field_type = field.part.FieldType.differentiate()
                            let field_type_str = ''
                            switch (field_type.kind) {
                                case "Primitive":
                                    switch (field_type.val) {
                                        case Symbol.double:
                                            field_type_str = "f64"
                                            break;
                                        case Symbol.float:
                                            field_type_str ="f32"
                                            break;
                                        case Symbol.int32:
                                            field_type_str ="i32"
                                            break;
                                        case Symbol.int64:
                                            field_type_str ="i64"
                                            break;
                                        case Symbol.string:
                                            field_type_str = "String"
                                            break;
                                        case Symbol.uint32:
                                            field_type_str = "u32"
                                            break;
                                        case Symbol.uint64:
                                            field_type_str = "u64"
                                            break;
                                        case Symbol.bool:
                                            field_type_str = "bool"
                                            break;

                                        case Symbol.bytes:
                                            throw new Error("bytes isn't a supporetd type yet")

                                        default: assertNever(field_type.val)
                                    }
                                    break;
                                case "Message":
                                    field_type_str = field_type.name
                                    break;

                                case "Enum":
                                    field_type_str = 'u8'
                                    break;
                            }
                            return `${field.name}: ${field_type_str}`
                        }).join(",\n")}
                    }
                `)

        }
    })
    fs.mkdirSync(".deploy/src", {recursive: true})
    fs.writeFileSync(".deploy/src/main.rs", `
        use actix_web::{web, App, HttpResponse, HttpServer, Responder};
        use serde::{Deserialize, Serialize};

        ${structs.join("\n")}

        ${functions.map(f => f.def).join("\n\n")}

        #[actix_rt::main]
        async fn main() -> std::io::Result<()> {
            HttpServer::new(|| {
                App::new()
                    .route("/", web::get().to(index))
                    ${functions.map(f => `.route("/${f.path}", web::post().to(${f.func_name}))`).join("\n")}
            })
            .bind("0.0.0.0:8080")?
            .run()
            .await
        }

        async fn index() -> impl Responder {
            HttpResponse::Ok().body("Hello world!")
        }
    `)
    fs.writeFileSync(".deploy/Cargo.toml",
`[package]
name = "app"
version = "0.1.0"
authors = ["jermdroui <jerm@conder.systems>"]
edition = "2018"

# See more keys and their definitions at https://doc.rust-lang.org/cargo/reference/manifest.html

[dependencies]
actix-web = "2.0"
actix-rt = "1.0"


serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
json = "0.12"
`)
    fs.writeFileSync(".deploy/Cargo.lock", cargolockstr)

   
   
    fs.writeFileSync(".deploy/Dockerfile",
`
FROM rust:1.40 as builder

RUN USER=root cargo new --bin app

WORKDIR /app
# create a new empty shell project

# copy over your manifests just to build dependencies
COPY ./Cargo.lock ./Cargo.lock
COPY ./Cargo.toml ./Cargo.toml

# this build step will cache your dependencies
RUN cargo build --release

# copy the conduit generated source
COPY ./src/main.rs ./src/main.rs

# build for release
RUN rm ./target/release/deps/app*
RUN cargo build --release


FROM debian:buster-slim
RUN apt-get update && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/app /usr/local/bin/app
EXPOSE 8080
CMD ["app"]
`)
    child_process.execSync("docker build -t conder-systems/cloud-run-gen .", {cwd: ".deploy/", stdio: "inherit"})
    child_process.execSync("docker tag conder-systems/cloud-run-gen us.gcr.io/conder-systems-281115/hello-world-gen", {cwd: ".deploy/"})
    child_process.execSync("docker push us.gcr.io/conder-systems-281115/hello-world-gen")

    return "us.gcr.io/conder-systems-281115/hello-world-gen:latest"
}


const cargolockstr = `
# This file is automatically @generated by Cargo.
# It is not intended for manual editing.
[[package]]
name = "actix-codec"
version = "0.2.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "09e55f0a5c2ca15795035d90c46bd0e73a5123b72f68f12596d6ba5282051380"
dependencies = [
 "bitflags",
 "bytes",
 "futures-core",
 "futures-sink",
 "log",
 "tokio",
 "tokio-util 0.2.0",
]

[[package]]
name = "actix-connect"
version = "1.0.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "c95cc9569221e9802bf4c377f6c18b90ef10227d787611decf79fd47d2a8e76c"
dependencies = [
 "actix-codec",
 "actix-rt",
 "actix-service",
 "actix-utils",
 "derive_more",
 "either",
 "futures",
 "http",
 "log",
 "trust-dns-proto",
 "trust-dns-resolver",
]

[[package]]
name = "actix-http"
version = "1.0.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "c16664cc4fdea8030837ad5a845eb231fb93fc3c5c171edfefb52fad92ce9019"
dependencies = [
 "actix-codec",
 "actix-connect",
 "actix-rt",
 "actix-service",
 "actix-threadpool",
 "actix-utils",
 "base64",
 "bitflags",
 "brotli2",
 "bytes",
 "chrono",
 "copyless",
 "derive_more",
 "either",
 "encoding_rs",
 "failure",
 "flate2",
 "futures-channel",
 "futures-core",
 "futures-util",
 "fxhash",
 "h2",
 "http",
 "httparse",
 "indexmap",
 "language-tags",
 "lazy_static",
 "log",
 "mime",
 "percent-encoding",
 "pin-project",
 "rand",
 "regex",
 "serde",
 "serde_json",
 "serde_urlencoded",
 "sha1",
 "slab",
 "time",
]

[[package]]
name = "actix-macros"
version = "0.1.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "a60f9ba7c4e6df97f3aacb14bb5c0cd7d98a49dcbaed0d7f292912ad9a6a3ed2"
dependencies = [
 "quote",
 "syn",
]

[[package]]
name = "actix-router"
version = "0.2.4"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "9d7a10ca4d94e8c8e7a87c5173aba1b97ba9a6563ca02b0e1cd23531093d3ec8"
dependencies = [
 "bytestring",
 "http",
 "log",
 "regex",
 "serde",
]

[[package]]
name = "actix-rt"
version = "1.1.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "143fcc2912e0d1de2bcf4e2f720d2a60c28652ab4179685a1ee159e0fb3db227"
dependencies = [
 "actix-macros",
 "actix-threadpool",
 "copyless",
 "futures-channel",
 "futures-util",
 "smallvec",
 "tokio",
]

[[package]]
name = "actix-server"
version = "1.0.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "e6d74b464215a473c973a2d7d03a69cc10f4ce1f4b38a7659c5193dc5c675630"
dependencies = [
 "actix-codec",
 "actix-rt",
 "actix-service",
 "actix-utils",
 "futures-channel",
 "futures-util",
 "log",
 "mio",
 "mio-uds",
 "num_cpus",
 "slab",
 "socket2",
]

[[package]]
name = "actix-service"
version = "1.0.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "d3e4fc95dfa7e24171b2d0bb46b85f8ab0e8499e4e3caec691fc4ea65c287564"
dependencies = [
 "futures-util",
 "pin-project",
]

[[package]]
name = "actix-testing"
version = "1.0.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "47239ca38799ab74ee6a8a94d1ce857014b2ac36f242f70f3f75a66f691e791c"
dependencies = [
 "actix-macros",
 "actix-rt",
 "actix-server",
 "actix-service",
 "log",
 "socket2",
]

[[package]]
name = "actix-threadpool"
version = "0.3.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "d209f04d002854b9afd3743032a27b066158817965bf5d036824d19ac2cc0e30"
dependencies = [
 "derive_more",
 "futures-channel",
 "lazy_static",
 "log",
 "num_cpus",
 "parking_lot",
 "threadpool",
]

[[package]]
name = "actix-tls"
version = "1.0.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "a4e5b4faaf105e9a6d389c606c298dcdb033061b00d532af9df56ff3a54995a8"
dependencies = [
 "actix-codec",
 "actix-rt",
 "actix-service",
 "actix-utils",
 "derive_more",
 "either",
 "futures",
 "log",
]

[[package]]
name = "actix-utils"
version = "1.0.6"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "fcf8f5631bf01adec2267808f00e228b761c60c0584cc9fa0b5364f41d147f4e"
dependencies = [
 "actix-codec",
 "actix-rt",
 "actix-service",
 "bitflags",
 "bytes",
 "either",
 "futures",
 "log",
 "pin-project",
 "slab",
]

[[package]]
name = "actix-web"
version = "2.0.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "3158e822461040822f0dbf1735b9c2ce1f95f93b651d7a7aded00b1efbb1f635"
dependencies = [
 "actix-codec",
 "actix-http",
 "actix-macros",
 "actix-router",
 "actix-rt",
 "actix-server",
 "actix-service",
 "actix-testing",
 "actix-threadpool",
 "actix-tls",
 "actix-utils",
 "actix-web-codegen",
 "awc",
 "bytes",
 "derive_more",
 "encoding_rs",
 "futures",
 "fxhash",
 "log",
 "mime",
 "net2",
 "pin-project",
 "regex",
 "serde",
 "serde_json",
 "serde_urlencoded",
 "time",
 "url",
]

[[package]]
name = "actix-web-codegen"
version = "0.2.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "a71bf475cbe07281d0b3696abb48212db118e7e23219f13596ce865235ff5766"
dependencies = [
 "proc-macro2",
 "quote",
 "syn",
]

[[package]]
name = "addr2line"
version = "0.13.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "1b6a2d3371669ab3ca9797670853d61402b03d0b4b9ebf33d677dfa720203072"
dependencies = [
 "gimli",
]

[[package]]
name = "adler"
version = "0.2.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "ee2a4ec343196209d6594e19543ae87a39f96d5534d7174822a3ad825dd6ed7e"

[[package]]
name = "aho-corasick"
version = "0.7.13"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "043164d8ba5c4c3035fec9bbee8647c0261d788f3474306f93bb65901cae0e86"
dependencies = [
 "memchr",
]

[[package]]
name = "arc-swap"
version = "0.4.7"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "4d25d88fd6b8041580a654f9d0c581a047baee2b3efee13275f2fc392fc75034"

[[package]]
name = "async-trait"
version = "0.1.36"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "a265e3abeffdce30b2e26b7a11b222fe37c6067404001b434101457d0385eb92"
dependencies = [
 "proc-macro2",
 "quote",
 "syn",
]

[[package]]
name = "autocfg"
version = "1.0.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "f8aac770f1885fd7e387acedd76065302551364496e46b3dd00860b2f8359b9d"

[[package]]
name = "awc"
version = "1.0.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "d7601d4d1d7ef2335d6597a41b5fe069f6ab799b85f53565ab390e7b7065aac5"
dependencies = [
 "actix-codec",
 "actix-http",
 "actix-rt",
 "actix-service",
 "base64",
 "bytes",
 "derive_more",
 "futures-core",
 "log",
 "mime",
 "percent-encoding",
 "rand",
 "serde",
 "serde_json",
 "serde_urlencoded",
]

[[package]]
name = "backtrace"
version = "0.3.50"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "46254cf2fdcdf1badb5934448c1bcbe046a56537b3987d96c51a7afc5d03f293"
dependencies = [
 "addr2line",
 "cfg-if",
 "libc",
 "miniz_oxide",
 "object",
 "rustc-demangle",
]

[[package]]
name = "base64"
version = "0.11.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "b41b7ea54a0c9d92199de89e20e58d49f02f8e699814ef3fdf266f6f748d15c7"

[[package]]
name = "bitflags"
version = "1.2.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "cf1de2fe8c75bc145a2f577add951f8134889b4795d47466a54a5c846d691693"

[[package]]
name = "brotli-sys"
version = "0.3.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "4445dea95f4c2b41cde57cc9fee236ae4dbae88d8fcbdb4750fc1bb5d86aaecd"
dependencies = [
 "cc",
 "libc",
]

[[package]]
name = "brotli2"
version = "0.3.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "0cb036c3eade309815c15ddbacec5b22c4d1f3983a774ab2eac2e3e9ea85568e"
dependencies = [
 "brotli-sys",
 "libc",
]

[[package]]
name = "byteorder"
version = "1.3.4"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "08c48aae112d48ed9f069b33538ea9e3e90aa263cfa3d1c24309612b1f7472de"

[[package]]
name = "bytes"
version = "0.5.6"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "0e4cec68f03f32e44924783795810fa50a7035d8c8ebe78580ad7e6c703fba38"

[[package]]
name = "bytestring"
version = "0.1.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "fc7c05fa5172da78a62d9949d662d2ac89d4cc7355d7b49adee5163f1fb3f363"
dependencies = [
 "bytes",
]

[[package]]
name = "cc"
version = "1.0.58"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "f9a06fb2e53271d7c279ec1efea6ab691c35a2ae67ec0d91d7acec0caf13b518"

[[package]]
name = "cfg-if"
version = "0.1.10"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "4785bdd1c96b2a846b2bd7cc02e86b6b3dbf14e7e53446c4f54c92a361040822"

[[package]]
name = "chrono"
version = "0.4.13"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "c74d84029116787153e02106bf53e66828452a4b325cc8652b788b5967c0a0b6"
dependencies = [
 "num-integer",
 "num-traits",
 "time",
]

[[package]]
name = "cloudabi"
version = "0.1.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "4344512281c643ae7638bbabc3af17a11307803ec8f0fcad9fae512a8bf36467"
dependencies = [
 "bitflags",
]

[[package]]
name = "copyless"
version = "0.1.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "a2df960f5d869b2dd8532793fde43eb5427cceb126c929747a26823ab0eeb536"

[[package]]
name = "crc32fast"
version = "1.2.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "ba125de2af0df55319f41944744ad91c71113bf74a4646efff39afe1f6842db1"
dependencies = [
 "cfg-if",
]

[[package]]
name = "derive_more"
version = "0.99.9"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "298998b1cf6b5b2c8a7b023dfd45821825ce3ba8a8af55c921a0e734e4653f76"
dependencies = [
 "proc-macro2",
 "quote",
 "syn",
]

[[package]]
name = "dtoa"
version = "0.4.6"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "134951f4028bdadb9b84baf4232681efbf277da25144b9b0ad65df75946c422b"

[[package]]
name = "either"
version = "1.5.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "bb1f6b1ce1c140482ea30ddd3335fc0024ac7ee112895426e0a629a6c20adfe3"

[[package]]
name = "encoding_rs"
version = "0.8.23"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "e8ac63f94732332f44fe654443c46f6375d1939684c17b0afb6cb56b0456e171"
dependencies = [
 "cfg-if",
]

[[package]]
name = "enum-as-inner"
version = "0.3.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "bc4bfcfacb61d231109d1d55202c1f33263319668b168843e02ad4652725ec9c"
dependencies = [
 "heck",
 "proc-macro2",
 "quote",
 "syn",
]

[[package]]
name = "failure"
version = "0.1.8"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "d32e9bd16cc02eae7db7ef620b392808b89f6a5e16bb3497d159c6b92a0f4f86"
dependencies = [
 "backtrace",
 "failure_derive",
]

[[package]]
name = "failure_derive"
version = "0.1.8"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "aa4da3c766cd7a0db8242e326e9e4e081edd567072893ed320008189715366a4"
dependencies = [
 "proc-macro2",
 "quote",
 "syn",
 "synstructure",
]

[[package]]
name = "flate2"
version = "1.0.16"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "68c90b0fc46cf89d227cc78b40e494ff81287a92dd07631e5af0d06fe3cf885e"
dependencies = [
 "cfg-if",
 "crc32fast",
 "libc",
 "miniz_oxide",
]

[[package]]
name = "fnv"
version = "1.0.7"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "3f9eec918d3f24069decb9af1554cad7c880e2da24a9afd88aca000531ab82c1"

[[package]]
name = "fuchsia-zircon"
version = "0.3.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "2e9763c69ebaae630ba35f74888db465e49e259ba1bc0eda7d06f4a067615d82"
dependencies = [
 "bitflags",
 "fuchsia-zircon-sys",
]

[[package]]
name = "fuchsia-zircon-sys"
version = "0.3.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "3dcaa9ae7725d12cdb85b3ad99a434db70b468c09ded17e012d86b5c1010f7a7"

[[package]]
name = "futures"
version = "0.3.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "1e05b85ec287aac0dc34db7d4a569323df697f9c55b99b15d6b4ef8cde49f613"
dependencies = [
 "futures-channel",
 "futures-core",
 "futures-executor",
 "futures-io",
 "futures-sink",
 "futures-task",
 "futures-util",
]

[[package]]
name = "futures-channel"
version = "0.3.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "f366ad74c28cca6ba456d95e6422883cfb4b252a83bed929c83abfdbbf2967d5"
dependencies = [
 "futures-core",
 "futures-sink",
]

[[package]]
name = "futures-core"
version = "0.3.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "59f5fff90fd5d971f936ad674802482ba441b6f09ba5e15fd8b39145582ca399"

[[package]]
name = "futures-executor"
version = "0.3.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "10d6bb888be1153d3abeb9006b11b02cf5e9b209fda28693c31ae1e4e012e314"
dependencies = [
 "futures-core",
 "futures-task",
 "futures-util",
]

[[package]]
name = "futures-io"
version = "0.3.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "de27142b013a8e869c14957e6d2edeef89e97c289e69d042ee3a49acd8b51789"

[[package]]
name = "futures-macro"
version = "0.3.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "d0b5a30a4328ab5473878237c447333c093297bded83a4983d10f4deea240d39"
dependencies = [
 "proc-macro-hack",
 "proc-macro2",
 "quote",
 "syn",
]

[[package]]
name = "futures-sink"
version = "0.3.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "3f2032893cb734c7a05d85ce0cc8b8c4075278e93b24b66f9de99d6eb0fa8acc"

[[package]]
name = "futures-task"
version = "0.3.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "bdb66b5f09e22019b1ab0830f7785bcea8e7a42148683f99214f73f8ec21a626"
dependencies = [
 "once_cell",
]

[[package]]
name = "futures-util"
version = "0.3.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "8764574ff08b701a084482c3c7031349104b07ac897393010494beaa18ce32c6"
dependencies = [
 "futures-channel",
 "futures-core",
 "futures-io",
 "futures-macro",
 "futures-sink",
 "futures-task",
 "memchr",
 "pin-project",
 "pin-utils",
 "proc-macro-hack",
 "proc-macro-nested",
 "slab",
]

[[package]]
name = "fxhash"
version = "0.2.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "c31b6d751ae2c7f11320402d34e41349dd1016f8d5d45e48c4312bc8625af50c"
dependencies = [
 "byteorder",
]

[[package]]
name = "getrandom"
version = "0.1.14"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "7abc8dd8451921606d809ba32e95b6111925cd2906060d2dcc29c070220503eb"
dependencies = [
 "cfg-if",
 "libc",
 "wasi",
]

[[package]]
name = "gimli"
version = "0.22.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "aaf91faf136cb47367fa430cd46e37a788775e7fa104f8b4bcb3861dc389b724"

[[package]]
name = "h2"
version = "0.2.6"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "993f9e0baeed60001cf565546b0d3dbe6a6ad23f2bd31644a133c641eccf6d53"
dependencies = [
 "bytes",
 "fnv",
 "futures-core",
 "futures-sink",
 "futures-util",
 "http",
 "indexmap",
 "slab",
 "tokio",
 "tokio-util 0.3.1",
 "tracing",
]

[[package]]
name = "hashbrown"
version = "0.8.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "34f595585f103464d8d2f6e9864682d74c1601fed5e07d62b1c9058dba8246fb"
dependencies = [
 "autocfg",
]

[[package]]
name = "heck"
version = "0.3.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "20564e78d53d2bb135c343b3f47714a56af2061f1c928fdb541dc7b9fdd94205"
dependencies = [
 "unicode-segmentation",
]

[[package]]
name = "hello_cargo"
version = "0.1.0"
dependencies = [
 "actix-rt",
 "actix-web",
 "json",
 "serde",
 "serde_json",
]

[[package]]
name = "hermit-abi"
version = "0.1.15"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "3deed196b6e7f9e44a2ae8d94225d80302d81208b1bb673fd21fe634645c85a9"
dependencies = [
 "libc",
]

[[package]]
name = "hostname"
version = "0.3.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "3c731c3e10504cc8ed35cfe2f1db4c9274c3d35fa486e3b31df46f068ef3e867"
dependencies = [
 "libc",
 "match_cfg",
 "winapi 0.3.9",
]

[[package]]
name = "http"
version = "0.2.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "28d569972648b2c512421b5f2a405ad6ac9666547189d0c5477a3f200f3e02f9"
dependencies = [
 "bytes",
 "fnv",
 "itoa",
]

[[package]]
name = "httparse"
version = "1.3.4"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "cd179ae861f0c2e53da70d892f5f3029f9594be0c41dc5269cd371691b1dc2f9"

[[package]]
name = "idna"
version = "0.2.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "02e2673c30ee86b5b96a9cb52ad15718aa1f966f5ab9ad54a8b95d5ca33120a9"
dependencies = [
 "matches",
 "unicode-bidi",
 "unicode-normalization",
]

[[package]]
name = "indexmap"
version = "1.5.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "5b88cd59ee5f71fea89a62248fc8f387d44400cefe05ef548466d61ced9029a7"
dependencies = [
 "autocfg",
 "hashbrown",
]

[[package]]
name = "instant"
version = "0.1.6"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "5b141fdc7836c525d4d594027d318c84161ca17aaf8113ab1f81ab93ae897485"

[[package]]
name = "iovec"
version = "0.1.4"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "b2b3ea6ff95e175473f8ffe6a7eb7c00d054240321b84c57051175fe3c1e075e"
dependencies = [
 "libc",
]

[[package]]
name = "ipconfig"
version = "0.2.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "f7e2f18aece9709094573a9f24f483c4f65caa4298e2f7ae1b71cc65d853fad7"
dependencies = [
 "socket2",
 "widestring",
 "winapi 0.3.9",
 "winreg",
]

[[package]]
name = "itoa"
version = "0.4.6"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "dc6f3ad7b9d11a0c00842ff8de1b60ee58661048eb8049ed33c73594f359d7e6"

[[package]]
name = "json"
version = "0.12.4"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "078e285eafdfb6c4b434e0d31e8cfcb5115b651496faca5749b88fafd4f23bfd"

[[package]]
name = "kernel32-sys"
version = "0.2.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "7507624b29483431c0ba2d82aece8ca6cdba9382bff4ddd0f7490560c056098d"
dependencies = [
 "winapi 0.2.8",
 "winapi-build",
]

[[package]]
name = "language-tags"
version = "0.2.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "a91d884b6667cd606bb5a69aa0c99ba811a115fc68915e7056ec08a46e93199a"

[[package]]
name = "lazy_static"
version = "1.4.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "e2abad23fbc42b3700f2f279844dc832adb2b2eb069b2df918f455c4e18cc646"

[[package]]
name = "libc"
version = "0.2.73"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "bd7d4bd64732af4bf3a67f367c27df8520ad7e230c5817b8ff485864d80242b9"

[[package]]
name = "linked-hash-map"
version = "0.5.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "8dd5a6d5999d9907cda8ed67bbd137d3af8085216c2ac62de5be860bd41f304a"

[[package]]
name = "lock_api"
version = "0.4.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "28247cc5a5be2f05fbcd76dd0cf2c7d3b5400cb978a28042abcd4fa0b3f8261c"
dependencies = [
 "scopeguard",
]

[[package]]
name = "log"
version = "0.4.11"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "4fabed175da42fed1fa0746b0ea71f412aa9d35e76e95e59b192c64b9dc2bf8b"
dependencies = [
 "cfg-if",
]

[[package]]
name = "lru-cache"
version = "0.1.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "31e24f1ad8321ca0e8a1e0ac13f23cb668e6f5466c2c57319f6a5cf1cc8e3b1c"
dependencies = [
 "linked-hash-map",
]

[[package]]
name = "match_cfg"
version = "0.1.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "ffbee8634e0d45d258acb448e7eaab3fce7a0a467395d4d9f228e3c1f01fb2e4"

[[package]]
name = "matches"
version = "0.1.8"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "7ffc5c5338469d4d3ea17d269fa8ea3512ad247247c30bd2df69e68309ed0a08"

[[package]]
name = "memchr"
version = "2.3.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "3728d817d99e5ac407411fa471ff9800a778d88a24685968b36824eaf4bee400"

[[package]]
name = "mime"
version = "0.3.16"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "2a60c7ce501c71e03a9c9c0d35b861413ae925bd979cc7a4e30d060069aaac8d"

[[package]]
name = "miniz_oxide"
version = "0.4.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "be0f75932c1f6cfae3c04000e40114adf955636e19040f9c0a2c380702aa1c7f"
dependencies = [
 "adler",
]

[[package]]
name = "mio"
version = "0.6.22"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "fce347092656428bc8eaf6201042cb551b8d67855af7374542a92a0fbfcac430"
dependencies = [
 "cfg-if",
 "fuchsia-zircon",
 "fuchsia-zircon-sys",
 "iovec",
 "kernel32-sys",
 "libc",
 "log",
 "miow",
 "net2",
 "slab",
 "winapi 0.2.8",
]

[[package]]
name = "mio-uds"
version = "0.6.8"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "afcb699eb26d4332647cc848492bbc15eafb26f08d0304550d5aa1f612e066f0"
dependencies = [
 "iovec",
 "libc",
 "mio",
]

[[package]]
name = "miow"
version = "0.2.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "8c1f2f3b1cf331de6896aabf6e9d55dca90356cc9960cca7eaaf408a355ae919"
dependencies = [
 "kernel32-sys",
 "net2",
 "winapi 0.2.8",
 "ws2_32-sys",
]

[[package]]
name = "net2"
version = "0.2.34"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "2ba7c918ac76704fb42afcbbb43891e72731f3dcca3bef2a19786297baf14af7"
dependencies = [
 "cfg-if",
 "libc",
 "winapi 0.3.9",
]

[[package]]
name = "num-integer"
version = "0.1.43"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "8d59457e662d541ba17869cf51cf177c0b5f0cbf476c66bdc90bf1edac4f875b"
dependencies = [
 "autocfg",
 "num-traits",
]

[[package]]
name = "num-traits"
version = "0.2.12"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "ac267bcc07f48ee5f8935ab0d24f316fb722d7a1292e2913f0cc196b29ffd611"
dependencies = [
 "autocfg",
]

[[package]]
name = "num_cpus"
version = "1.13.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "05499f3756671c15885fee9034446956fff3f243d6077b91e5767df161f766b3"
dependencies = [
 "hermit-abi",
 "libc",
]

[[package]]
name = "object"
version = "0.20.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "1ab52be62400ca80aa00285d25253d7f7c437b7375c4de678f5405d3afe82ca5"

[[package]]
name = "once_cell"
version = "1.4.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "0b631f7e854af39a1739f401cf34a8a013dfe09eac4fa4dba91e9768bd28168d"

[[package]]
name = "parking_lot"
version = "0.11.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "a4893845fa2ca272e647da5d0e46660a314ead9c2fdd9a883aabc32e481a8733"
dependencies = [
 "instant",
 "lock_api",
 "parking_lot_core",
]

[[package]]
name = "parking_lot_core"
version = "0.8.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "c361aa727dd08437f2f1447be8b59a33b0edd15e0fcee698f935613d9efbca9b"
dependencies = [
 "cfg-if",
 "cloudabi",
 "instant",
 "libc",
 "redox_syscall",
 "smallvec",
 "winapi 0.3.9",
]

[[package]]
name = "percent-encoding"
version = "2.1.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "d4fd5641d01c8f18a23da7b6fe29298ff4b55afcccdf78973b24cf3175fee32e"

[[package]]
name = "pin-project"
version = "0.4.22"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "12e3a6cdbfe94a5e4572812a0201f8c0ed98c1c452c7b8563ce2276988ef9c17"
dependencies = [
 "pin-project-internal",
]

[[package]]
name = "pin-project-internal"
version = "0.4.22"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "6a0ffd45cf79d88737d7cc85bfd5d2894bee1139b356e616fe85dc389c61aaf7"
dependencies = [
 "proc-macro2",
 "quote",
 "syn",
]

[[package]]
name = "pin-project-lite"
version = "0.1.7"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "282adbf10f2698a7a77f8e983a74b2d18176c19a7fd32a45446139ae7b02b715"

[[package]]
name = "pin-utils"
version = "0.1.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "8b870d8c151b6f2fb93e84a13146138f05d02ed11c7e7c54f8826aaaf7c9f184"

[[package]]
name = "ppv-lite86"
version = "0.2.8"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "237a5ed80e274dbc66f86bd59c1e25edc039660be53194b5fe0a482e0f2612ea"

[[package]]
name = "proc-macro-hack"
version = "0.5.16"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "7e0456befd48169b9f13ef0f0ad46d492cf9d2dbb918bcf38e01eed4ce3ec5e4"

[[package]]
name = "proc-macro-nested"
version = "0.1.6"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "eba180dafb9038b050a4c280019bbedf9f2467b61e5d892dcad585bb57aadc5a"

[[package]]
name = "proc-macro2"
version = "1.0.19"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "04f5f085b5d71e2188cb8271e5da0161ad52c3f227a661a3c135fdf28e258b12"
dependencies = [
 "unicode-xid",
]

[[package]]
name = "quick-error"
version = "1.2.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "a1d01941d82fa2ab50be1e79e6714289dd7cde78eba4c074bc5a4374f650dfe0"

[[package]]
name = "quote"
version = "1.0.7"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "aa563d17ecb180e500da1cfd2b028310ac758de548efdd203e18f283af693f37"
dependencies = [
 "proc-macro2",
]

[[package]]
name = "rand"
version = "0.7.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "6a6b1679d49b24bbfe0c803429aa1874472f50d9b363131f0e89fc356b544d03"
dependencies = [
 "getrandom",
 "libc",
 "rand_chacha",
 "rand_core",
 "rand_hc",
]

[[package]]
name = "rand_chacha"
version = "0.2.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "f4c8ed856279c9737206bf725bf36935d8666ead7aa69b52be55af369d193402"
dependencies = [
 "ppv-lite86",
 "rand_core",
]

[[package]]
name = "rand_core"
version = "0.5.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "90bde5296fc891b0cef12a6d03ddccc162ce7b2aff54160af9338f8d40df6d19"
dependencies = [
 "getrandom",
]

[[package]]
name = "rand_hc"
version = "0.2.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "ca3129af7b92a17112d59ad498c6f81eaf463253766b90396d39ea7a39d6613c"
dependencies = [
 "rand_core",
]

[[package]]
name = "redox_syscall"
version = "0.1.57"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "41cc0f7e4d5d4544e8861606a285bb08d3e70712ccc7d2b84d7c0ccfaf4b05ce"

[[package]]
name = "regex"
version = "1.3.9"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "9c3780fcf44b193bc4d09f36d2a3c87b251da4a046c87795a0d35f4f927ad8e6"
dependencies = [
 "aho-corasick",
 "memchr",
 "regex-syntax",
 "thread_local",
]

[[package]]
name = "regex-syntax"
version = "0.6.18"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "26412eb97c6b088a6997e05f69403a802a92d520de2f8e63c2b65f9e0f47c4e8"

[[package]]
name = "resolv-conf"
version = "0.6.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "11834e137f3b14e309437a8276714eed3a80d1ef894869e510f2c0c0b98b9f4a"
dependencies = [
 "hostname",
 "quick-error",
]

[[package]]
name = "rustc-demangle"
version = "0.1.16"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "4c691c0e608126e00913e33f0ccf3727d5fc84573623b8d65b2df340b5201783"

[[package]]
name = "ryu"
version = "1.0.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "71d301d4193d031abdd79ff7e3dd721168a9572ef3fe51a1517aba235bd8f86e"

[[package]]
name = "scopeguard"
version = "1.1.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "d29ab0c6d3fc0ee92fe66e2d99f700eab17a8d57d1c1d3b748380fb20baa78cd"

[[package]]
name = "serde"
version = "1.0.114"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "5317f7588f0a5078ee60ef675ef96735a1442132dc645eb1d12c018620ed8cd3"
dependencies = [
 "serde_derive",
]

[[package]]
name = "serde_derive"
version = "1.0.114"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "2a0be94b04690fbaed37cddffc5c134bf537c8e3329d53e982fe04c374978f8e"
dependencies = [
 "proc-macro2",
 "quote",
 "syn",
]

[[package]]
name = "serde_json"
version = "1.0.56"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "3433e879a558dde8b5e8feb2a04899cf34fdde1fafb894687e52105fc1162ac3"
dependencies = [
 "itoa",
 "ryu",
 "serde",
]

[[package]]
name = "serde_urlencoded"
version = "0.6.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "9ec5d77e2d4c73717816afac02670d5c4f534ea95ed430442cad02e7a6e32c97"
dependencies = [
 "dtoa",
 "itoa",
 "serde",
 "url",
]

[[package]]
name = "sha1"
version = "0.6.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "2579985fda508104f7587689507983eadd6a6e84dd35d6d115361f530916fa0d"

[[package]]
name = "signal-hook-registry"
version = "1.2.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "94f478ede9f64724c5d173d7bb56099ec3e2d9fc2774aac65d34b8b890405f41"
dependencies = [
 "arc-swap",
 "libc",
]

[[package]]
name = "slab"
version = "0.4.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "c111b5bd5695e56cffe5129854aa230b39c93a305372fdbb2668ca2394eea9f8"

[[package]]
name = "smallvec"
version = "1.4.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "3757cb9d89161a2f24e1cf78efa0c1fcff485d18e3f55e0aa3480824ddaa0f3f"

[[package]]
name = "socket2"
version = "0.3.12"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "03088793f677dce356f3ccc2edb1b314ad191ab702a5de3faf49304f7e104918"
dependencies = [
 "cfg-if",
 "libc",
 "redox_syscall",
 "winapi 0.3.9",
]

[[package]]
name = "syn"
version = "1.0.35"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "fb7f4c519df8c117855e19dd8cc851e89eb746fe7a73f0157e0d95fdec5369b0"
dependencies = [
 "proc-macro2",
 "quote",
 "unicode-xid",
]

[[package]]
name = "synstructure"
version = "0.12.4"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "b834f2d66f734cb897113e34aaff2f1ab4719ca946f9a7358dba8f8064148701"
dependencies = [
 "proc-macro2",
 "quote",
 "syn",
 "unicode-xid",
]

[[package]]
name = "thread_local"
version = "1.0.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "d40c6d1b69745a6ec6fb1ca717914848da4b44ae29d9b3080cbee91d72a69b14"
dependencies = [
 "lazy_static",
]

[[package]]
name = "threadpool"
version = "1.8.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "d050e60b33d41c19108b32cea32164033a9013fe3b46cbd4457559bfbf77afaa"
dependencies = [
 "num_cpus",
]

[[package]]
name = "time"
version = "0.1.43"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "ca8a50ef2360fbd1eeb0ecd46795a87a19024eb4b53c5dc916ca1fd95fe62438"
dependencies = [
 "libc",
 "winapi 0.3.9",
]

[[package]]
name = "tinyvec"
version = "0.3.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "53953d2d3a5ad81d9f844a32f14ebb121f50b650cd59d0ee2a07cf13c617efed"

[[package]]
name = "tokio"
version = "0.2.21"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "d099fa27b9702bed751524694adbe393e18b36b204da91eb1cbbbbb4a5ee2d58"
dependencies = [
 "bytes",
 "futures-core",
 "iovec",
 "lazy_static",
 "libc",
 "memchr",
 "mio",
 "mio-uds",
 "pin-project-lite",
 "signal-hook-registry",
 "slab",
 "winapi 0.3.9",
]

[[package]]
name = "tokio-util"
version = "0.2.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "571da51182ec208780505a32528fc5512a8fe1443ab960b3f2f3ef093cd16930"
dependencies = [
 "bytes",
 "futures-core",
 "futures-sink",
 "log",
 "pin-project-lite",
 "tokio",
]

[[package]]
name = "tokio-util"
version = "0.3.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "be8242891f2b6cbef26a2d7e8605133c2c554cd35b3e4948ea892d6d68436499"
dependencies = [
 "bytes",
 "futures-core",
 "futures-sink",
 "log",
 "pin-project-lite",
 "tokio",
]

[[package]]
name = "tracing"
version = "0.1.16"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "c2e2a2de6b0d5cbb13fc21193a2296888eaab62b6044479aafb3c54c01c29fcd"
dependencies = [
 "cfg-if",
 "log",
 "tracing-core",
]

[[package]]
name = "tracing-core"
version = "0.1.11"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "94ae75f0d28ae10786f3b1895c55fe72e79928fd5ccdebb5438c75e93fec178f"
dependencies = [
 "lazy_static",
]

[[package]]
name = "trust-dns-proto"
version = "0.18.0-alpha.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "2a7f3a2ab8a919f5eca52a468866a67ed7d3efa265d48a652a9a3452272b413f"
dependencies = [
 "async-trait",
 "enum-as-inner",
 "failure",
 "futures",
 "idna",
 "lazy_static",
 "log",
 "rand",
 "smallvec",
 "socket2",
 "tokio",
 "url",
]

[[package]]
name = "trust-dns-resolver"
version = "0.18.0-alpha.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "6f90b1502b226f8b2514c6d5b37bafa8c200d7ca4102d57dc36ee0f3b7a04a2f"
dependencies = [
 "cfg-if",
 "failure",
 "futures",
 "ipconfig",
 "lazy_static",
 "log",
 "lru-cache",
 "resolv-conf",
 "smallvec",
 "tokio",
 "trust-dns-proto",
]

[[package]]
name = "unicode-bidi"
version = "0.3.4"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "49f2bd0c6468a8230e1db229cff8029217cf623c767ea5d60bfbd42729ea54d5"
dependencies = [
 "matches",
]

[[package]]
name = "unicode-normalization"
version = "0.1.13"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "6fb19cf769fa8c6a80a162df694621ebeb4dafb606470b2b2fce0be40a98a977"
dependencies = [
 "tinyvec",
]

[[package]]
name = "unicode-segmentation"
version = "1.6.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "e83e153d1053cbb5a118eeff7fd5be06ed99153f00dbcd8ae310c5fb2b22edc0"

[[package]]
name = "unicode-xid"
version = "0.2.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "f7fe0bb3479651439c9112f72b6c505038574c9fbb575ed1bf3b797fa39dd564"

[[package]]
name = "url"
version = "2.1.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "829d4a8476c35c9bf0bbce5a3b23f4106f79728039b726d292bb93bc106787cb"
dependencies = [
 "idna",
 "matches",
 "percent-encoding",
]

[[package]]
name = "wasi"
version = "0.9.0+wasi-snapshot-preview1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "cccddf32554fecc6acb585f82a32a72e28b48f8c4c1883ddfeeeaa96f7d8e519"

[[package]]
name = "widestring"
version = "0.4.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "a763e303c0e0f23b0da40888724762e802a8ffefbc22de4127ef42493c2ea68c"

[[package]]
name = "winapi"
version = "0.2.8"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "167dc9d6949a9b857f3451275e911c3f44255842c1f7a76f33c55103a909087a"

[[package]]
name = "winapi"
version = "0.3.9"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "5c839a674fcd7a98952e593242ea400abe93992746761e38641405d28b00f419"
dependencies = [
 "winapi-i686-pc-windows-gnu",
 "winapi-x86_64-pc-windows-gnu",
]

[[package]]
name = "winapi-build"
version = "0.1.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "2d315eee3b34aca4797b2da6b13ed88266e6d612562a0c46390af8299fc699bc"

[[package]]
name = "winapi-i686-pc-windows-gnu"
version = "0.4.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "ac3b87c63620426dd9b991e5ce0329eff545bccbbb34f3be09ff6fb6ab51b7b6"

[[package]]
name = "winapi-x86_64-pc-windows-gnu"
version = "0.4.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "712e227841d057c1ee1cd2fb22fa7e5a5461ae8e48fa2ca79ec42cfc1931183f"

[[package]]
name = "winreg"
version = "0.6.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "b2986deb581c4fe11b621998a5e53361efe6b48a151178d0cd9eeffa4dc6acc9"
dependencies = [
 "winapi 0.3.9",
]

[[package]]
name = "ws2_32-sys"
version = "0.2.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "d59cefebd0c892fa2dd6de581e937301d8552cb44489cdff035c6187cb63fa5e"
dependencies = [
 "winapi 0.2.8",
 "winapi-build",
]

`