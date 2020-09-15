
import { CompiledTypes, Lexicon, Utilities, SchemaInstance, AnySchemaInstance} from 'conduit_parser';



export type ReturnInstruction = Readonly<{
    kind: "save"
    name: string
} | {kind: "drop"}>

const postgresType: Record<Lexicon.PrimitiveUnion, string> = {
    string: "text",
    int: "bigint",
    double: "double precision",
    bool: "boolean"
}


export function createSQLFor(store: CompiledTypes.HierarchicalStore) : string {
    function createSqlForSchema(schema: SchemaInstance<"Object">, thisTableName: string): {table_body: string, before_tables: string, after_tables: string} {
        const creates: string[] = []
        const postCreates: string[] = []

        const constraints: string[] = []
    
        const cols: string[]  = []

        function createChildObjectSql(field: string,child: SchemaInstance<"Object">): string {
            const thisObjectName = `${thisTableName}_${field}`
            const other = createSqlForSchema(child, thisObjectName)
            creates.push(other.before_tables)
            creates.push(`CREATE TABLE ${thisObjectName} (
                ${other.table_body}
            );`)
            postCreates.push(other.after_tables)
            return thisObjectName
        }
        
        for (const field in schema.data) {
            const fieldSchema: AnySchemaInstance = schema.data[field] 
            switch (fieldSchema.kind) {
                case "Array":
                    const arrayInner = fieldSchema.data[0] as Exclude<AnySchemaInstance, {kind: "Array" | "Optional"}>
                    if (arrayInner.kind === "Object") {
                        const name = createChildObjectSql(field, arrayInner)
                        postCreates.push(`CREATE TABLE ${field}x${name} (
                            left_ptr INT,
                            right_ptr INT,
                            FOREIGN KEY(right_ptr) REFERENCES ${name}(conduit_entity_id),
                            FOREIGN KEY(left_ptr) REFERENCES ${thisTableName}(conduit_entity_id)
                        );`)
                    } else {
                        cols.push(`${field}\t${postgresType[arrayInner.kind]}[]`)
                    }
                    
                    break
                case "Optional":
                    // We assume the previous type checking.
                    const optionInner = fieldSchema.data[0] as Exclude<AnySchemaInstance, {kind: "Array" | "Optional"}>
                    if (optionInner.kind === "Object"){
                        const name = createChildObjectSql(field, optionInner)
                        cols.push(`${field}\tINT`)
                        constraints.push(`FOREIGN KEY(${field}) REFERENCES ${name}(conduit_entity_id)`)
                    } else {
                        cols.push(`${field}\t${postgresType[optionInner.kind]}`)
                    }
                    break
                case "Object":
                    const tname = createChildObjectSql(field, fieldSchema)
                    cols.push(`${field}\tINT NOT NULL`)
                    constraints.push(`FOREIGN KEY(${field}) REFERENCES ${tname}(conduit_entity_id)`)
                    break

                case Lexicon.Symbol.bool:
                case Lexicon.Symbol.double:
                case Lexicon.Symbol.int:
                case Lexicon.Symbol.string:
                    cols.push(`${field}\t${postgresType[fieldSchema.kind]} NOT NULL`)
                    break

                default: Utilities.assertNever(fieldSchema)
            }
        } 
        constraints.push("PRIMARY KEY(conduit_entity_id)")
        cols.push("conduit_entity_id\tINT\tGENERATED ALWAYS AS IDENTITY")
        return {
            table_body: [...cols, ...constraints].join(",\n"),
            before_tables: creates.join("\n"),
            after_tables: postCreates.join("\n")
        }
    }
    



    if(store.schema.data[0].kind !== "Object") {
        throw Error(`Expected an object schema`)
    }
    const sql = createSqlForSchema(store.schema.data[0], store.name)

    return `
    ${sql.before_tables}

    CREATE TABLE ${store.name} (
        ${sql.table_body}
    );
    
    ${sql.after_tables}
    `
}


// export function generateInsertRustCode(store: CompiledTypes.HierarchicalStore, varname: string, ret: ReturnInstruction, nextReturnId: () => number): string[] {

//     const columns: string[] = []
//     const values: string[] = []
//     const array: string[]= []
//     const inserts: string[] = []
//     const postInsertPtrs: {relTableName: string, ptrVec: string}[] = []
//     let colCount = 0
//     store.columns.forEach(c => {
//         switch(c.dif) {
//             case "enum":
//             case "prim":
//                 columns.push(c.columnName)
//                 values.push(`$${++colCount}`)
//                 array.push(`&${varname}.${c.fieldName}`)
//                 break;

//             case "1:many":
//                 const manyRet = `ret${nextReturnId()}`
//                 const vecVarName = `vec_${manyRet}`
//                 const rowVarName = `row${nextReturnId()}`
//                 const forLoop = `
//                 let mut ${vecVarName}: Vec<i32> = Vec::new();
//                 for ${rowVarName} in &${varname}.${c.fieldName} {
//                     ${generateInsertRustCode(c.ref, `${rowVarName}`, {kind: "save", name: manyRet}, nextReturnId).join("\n")}
//                     ${vecVarName}.push(${manyRet}[0].get(0));
//                 }
//                 `

//                 postInsertPtrs.push({relTableName: c.refTableName, ptrVec: vecVarName})
//                 inserts.push(forLoop)
//                 break;

//             case "1:1":
//                 const returnedId = `ret${nextReturnId()}`
                
//                 if (c.modification === Lexicon.Symbol.Optional) {
//                     const unwrapped = `unwrapped${nextReturnId()}`
//                     const optionalChildInsertions = generateInsertRustCode(c.ref, unwrapped, {kind: "save", name: returnedId}, nextReturnId)
//                     const optionalReturnId = `optional${nextReturnId()}`
//                     inserts.push(`
//                         let ${optionalReturnId}: Option<i32> = match &${varname}.${c.fieldName} {
//                             Some(${unwrapped}) => {
//                                 ${optionalChildInsertions.join('\n')}

//                                 Some(${returnedId}[0].get(0))
//                             },
//                             None => None
//                         };
//                     `)
//                     columns.push(c.columnName)
//                     values.push(`$${++colCount}`)
//                     array.push(`&${optionalReturnId}`)
//                 } else {
//                     const entId = `entId${nextReturnId()}`
//                     inserts.push(...generateInsertRustCode(c.ref, `${varname}.${c.fieldName}`, {kind: "save", name: returnedId}, nextReturnId))
//                     columns.push(c.columnName)
//                     values.push(`$${++colCount}`)
//                     inserts.push(`let ${entId}: i32 = ${returnedId}[0].get(0);`)
//                     array.push(` &${entId}`)

//                 }
                
//                 break;
                
            
//             default: assertNever(c)
//         }
//     })

//     let insertionSql = ''
//     if (columns.length === 0) {
//         insertionSql = `insert into ${store.name} default values`
//     } else {
//         const tableAndColumns: string = `${store.name}(${columns.join(", ")})`
//         insertionSql = `insert into ${tableAndColumns} values (${values.join(", ")})`

//     }
//     values.push("NULL")
//     if (postInsertPtrs.length > 0 && ret.kind !== "save") {
//         ret = {kind: "save", name: `ret${nextReturnId()}`}
//     }

//     switch (ret.kind) {
//         case "save": {
//             const returnName = ret.name
//             const completequery = `${insertionSql} RETURNING conduit_entity_id`
//             const rustCode = `let ${returnName} = client.query("${completequery}", &[${array}]).await?;`
//             const entId = `ent${nextReturnId()}`
//             inserts.push(rustCode)
//             postInsertPtrs.forEach(post => {
//                 inserts.push(`

//                 let ${entId}: i32 = ${returnName}[0].get(0);
//                 while let Some(child_id) = ${post.ptrVec}.pop() {
//                     client.query("insert into ${post.relTableName}(left_ptr, right_ptr) values ($1, $2)", &[&${entId}, &child_id]).await?;
//                 }
                    
//                 `)
//             })
//             break
//         }
//         case "drop": {   
//             inserts.push(`client.query("${insertionSql}", &[${array}]).await?;`)
//             break
//         }

//         default: assertNever(ret)
//     }
    
//     return inserts
// }

// function generateQueryInterpreterInternal(specVarName: string, store: CompiledTypes.HierarchicalStore, nextReturnId: () => number, returnVecName: string, whereClause: string): string {
//     const structFieldAssignment:string[] = []
//     const childrenFetches: string[] = []
//     const extractions: string[] = []
//     const rowVarName = `row${nextReturnId()}`
//     const allVarName = `all${store.typeName}${nextReturnId()}`
//     const thisEntityIdVar = `${store.typeName}EntityId${nextReturnId()}`

//     store.columns.forEach((col) => {
//         switch (col.dif) {
//             case "enum":
//             case "prim":
//                 structFieldAssignment.push(`${col.fieldName}: ${rowVarName}.get("${col.columnName}")`)
//                 break;
//             case "1:1": {
//                 const childRetName = `all${col.type.name}${nextReturnId()}`
//                 childrenFetches.push(generateQueryInterpreterInternal(
//                     '',    
//                     col.ref,
//                     nextReturnId,
//                     childRetName, 
//                     `WHERE conduit_entity_id in (select ${col.columnName} from ${store.name})`
//                 ))
//                 const childMapVar = `entityIdTo${col.type.name}${nextReturnId()}`
                    
//                     const childRowVar = `row${nextReturnId()}`
                    
//                     childrenFetches.push(`
//                     let mut ${childMapVar}: HashMap<i32, ${col.type.name}> = HashMap::with_capacity(${childRetName}.len());
//                     while let Some(${childRowVar}) = ${childRetName}.pop() {
//                         ${childMapVar}.insert(${childRowVar}.conduit_entity_id.unwrap(), ${childRowVar});
//                     }
//                     `)
//                     const extractedVarName = `extracted${col.type.name}${nextReturnId()}`
                    

//                 if (col.modification === Lexicon.Symbol.Optional) {
//                     extractions.push(`
//                     // Extracting ${col.type.name}
//                     let ${extractedVarName} = match ${rowVarName}.get("${col.columnName}") {
//                         Some(ptr) => ${childMapVar}.remove(&ptr),
//                         None => None
//                     };
                    
//                     `)

//                     structFieldAssignment.push(`${col.fieldName}: ${extractedVarName}` )

//                 } else {
//                     extractions.push(`
//                     // Extracting ${col.type.name}
//                     let ${extractedVarName} = match ${childMapVar}.remove(&${rowVarName}.get("${col.columnName}")) {
//                         Some(t) => t,
//                         None => panic!("did not get an expected ${col.columnName}")
//                     };
//                     `)
//                     structFieldAssignment.push(`${col.fieldName}: ${extractedVarName}` )
//                 }
                

//                 break;
//             }

//             case "1:many": {
//                 const childRetName = `all${col.type.name}${nextReturnId()}`
//                 const childMapVar = `entityIdTo${col.type.name}${nextReturnId()}`
//                 childrenFetches.push(generateQueryInterpreterInternal(
//                     '',
//                     col.ref,
//                     nextReturnId,
//                     childRetName, 
//                     `WHERE conduit_entity_id in (select right_ptr from ${col.refTableName})`
//                 ))

                
//                 const childRowVar = `row${nextReturnId()}`
                
//                 childrenFetches.push(`
//                 let mut ${childMapVar}: HashMap<i32, ${col.type.name}> = HashMap::with_capacity(${childRetName}.len());
//                 while let Some(${childRowVar}) = ${childRetName}.pop() {
//                     ${childMapVar}.insert(${childRowVar}.conduit_entity_id.unwrap(), ${childRowVar});
//                 }
//                 `)

//                 const lrquery = `lr${nextReturnId()}`
//                 const lrmap = `lrmap${nextReturnId()}`
//                 const lrrow = `lrrow${nextReturnId()}`
//                 const l = `l${nextReturnId()}`
//                 const e = `e${nextReturnId()}`
                
//                 childrenFetches.push(`
//                 let mut ${lrquery} = client.query("select left_ptr, right_ptr from ${col.refTableName}", &[]).await?;
//                 let mut ${lrmap}: HashMap<i32, Vec<i32>> = HashMap::new();
//                 while let Some(${lrrow}) = ${lrquery}.pop() {
//                     let ${l} = ${lrrow}.get("left_ptr");
//                     ${lrmap}.entry(${l})
//                         .and_modify(|${e}| { ${e}.push(${lrrow}.get("right_ptr")) })
//                         .or_insert(vec![${lrrow}.get("right_ptr")]);
//                 }

//                 `)
                
//                 const entries = `entries${col.type.name}${nextReturnId()}`
//                 const childInstances = `instances${col.type.name}${nextReturnId()}`
//                 const childPtr = `child${nextReturnId()}`
//                 const empty = `empty${nextReturnId()}`
//                 extractions.push(`
//                 // Extracting ${col.type.name}s
//                 let ${empty} = Vec::with_capacity(0);
//                 let ${entries} = match ${lrmap}.remove(&${thisEntityIdVar}) {
//                     Some(ptrs) => ptrs,
//                     None => ${empty}
//                 };

//                 let mut ${childInstances}: Vec<${col.type.name}> = Vec::with_capacity(${entries}.len());

//                 for ${childPtr} in ${entries} {
//                     match ${childMapVar}.remove(&${childPtr}) {
//                         Some(real) => ${childInstances}.push(real),
//                         None => panic!("could not find expected ${col.type.name}")
//                     };
//                 }
//                 `)

                
//                 structFieldAssignment.push(`${col.fieldName}: ${childInstances}` )

//                 break;
//             }

//             default: assertNever(col)
//         }
        
//     })

//     return `
//     // Gettting all ${store.typeName}
//     let mut ${allVarName} = client.query("select * from ${store.name} ${whereClause}", &[]).await?;

//     ${childrenFetches.join("\n")}

//     let mut ${returnVecName} = Vec::with_capacity(${allVarName}.len());

//     while let Some(${rowVarName}) = ${allVarName}.pop() {
//         let ${thisEntityIdVar} = ${rowVarName}.get("conduit_entity_id");
//         ${extractions.join('\n')}
//         ${returnVecName}.push(${store.typeName} {
//             ${structFieldAssignment.join(",\n")},
//             conduit_entity_id: Some(${thisEntityIdVar})
//         })
//     }

//     `

// }


// export function generateQueryInterpreter(store: CompiledTypes.HierarchicalStore): string {
//     let n = 0

//     return `
//     async fn query_interpreter_${store.name}(querySpec: &${store.specName}, client: &Client) -> Result<Vec<${store.typeName}>, Error> {
//         ${generateQueryInterpreterInternal("querySpec", store, () => n++, "out", '')}
//         return Ok(out);
//     }
//     `

// }


// export function generateRustGetAllQuerySpec(store: CompiledTypes.HierarchicalStore): string {
//     const fields: string[] = []
//     store.columns.forEach(col => {
//         switch(col.dif) {
//             case "1:1":
//             case "1:many":
//                 fields.push(`${col.fieldName}: ${generateRustGetAllQuerySpec(col.ref)}`)
//                 break
//             case "enum":
//             case "prim":
//                 break
//             default: assertNever(col)
//         }
//     }) 
//     if (fields.length > 0) {
//         return `${store.specName} {
//             ${fields.join(",\n")}
//         }`
//     }
//     return `${store.specName}`
    
// }

// export function generatQueryResultType(store: CompiledTypes.HierarchicalStore): string[] {
//     const name = `${store.name}QueryResult`
//     const fields: string[] = []
//     const res: string[] = []
//     fields.push(`conduit_entity_id: Option<i32>`) 
//     store.columns.forEach(col => {
//         switch(col.dif) {
//             case "1:many": 
//             case "1:1": {
//                 const prefix = col.dif === "1:1" ? "" : "Vec<"
//                 const suffix = col.dif === "1:1" ? "" : ">"
                
//                 fields.push(`${col.fieldName}: Option<${prefix}${col.ref.name}QueryResult${suffix}>`)
//                 res.push(...generatQueryResultType(col.ref))
//                 break
//             }
            

            
            
                
//             case "enum":
//             case "prim": {
//                 let prefix = ''
//                 let suffix = ''
//                 switch (col.modification){
//                     case Lexicon.Symbol.Array:
//                         prefix = "Vec<"
//                         suffix = ">"
//                         break
//                     case Lexicon.Symbol.Optional:
//                         prefix = "Option<"
//                         suffix = ">"
//                     case Lexicon.Symbol.none:
//                         break

//                     default: assertNever(col)
//                 }
//                 const typeString = col.dif === "enum" ? "i64" : TypeWriter.rust.primitive[col.type.type]
                
//                 fields.push(`${col.fieldName}: Option<${prefix}${typeString}${suffix}>`)
//                 break
//             }

//             default: assertNever(col)
//         }
//     }) 

//     return [...res, `
//         #[derive(Serialize, Deserialize, Clone)]
//         struct ${name} {
//             ${fields.join(",\n")}
//         }
//         `
//     ]
    
// }