import { Symbol } from './lexicon';
import { assertNever } from './utils';
import { FileLocation } from "./utils";
import * as common from './entity/basic'


export namespace Parse {
    
    export type File = 
    common.Entity<"File"> & 
    common.ParentOfMany<Struct> &  
    common.ParentOfMany<common.Enum> & 
    common.ParentOfMany<Function> &
    common.ParentOfMany<StoreDefinition> &
    {readonly loc: FileLocation}

    export type CustomTypeEntity = common.IntrafileEntity<"CustomType", {type: string, modification: common.TypeModification}>
    export type FieldType = common.BaseFieldType<() => CustomTypeEntity>
    export type Field = common.BaseField<FieldType>

    export type VariableReference = common.IntrafileEntity<"VariableReference", {val: string}>
    export type Append = common.IntrafileEntity<"Append", {storeName: string, variableName: string}>
    export type Nothing = common.IntrafileEntity<"Nothing", {}>
    export type Returnable = common.PolymorphicEntity<"Returnable", () => Nothing | Assignable>
    export type ReturnStatement = common.IntrafileEntity<"ReturnStatement", common.RequiresOne<Returnable>>
    export type Assignable = common.PolymorphicEntity<"Assignable", () => VariableReference>
    export type VariableCreation = common.NamedIntrafile<"VariableCreation", common.RequiresOne<CustomTypeEntity> & common.RequiresOne<Assignable>>
    export type Statement = common.BaseStatement<() => ReturnStatement | Append | VariableCreation>

    export type FunctionBody = common.BaseFunctionBody<Statement>
    export type UnaryParameterType = common.PolymorphicEntity<"UnaryParameterType", () => CustomTypeEntity >
    export type NoParameter = common.IntrafileEntity<"NoParameter", {}>
    export type UnaryParameter = common.BaseUnaryParameter<UnaryParameterType>
    export type Parameter = common.PolymorphicEntity<"Parameter", () => UnaryParameter| NoParameter> 
    export type ReturnTypeSpec = common.BaseReturnTypeSpec<() => common.VoidReturn | CustomTypeEntity >
    export type Function = common.BaseFunction<FunctionBody, ReturnTypeSpec, Parameter>
    export type Struct = common.BaseStruct<Field>
    
    export type StoreDefinition = common.NamedIntrafile<"StoreDefinition", common.RequiresOne<CustomTypeEntity>>

    const symbolRegex: RegExp = new RegExp(`^(${Object.values(Symbol).join("|")})$`)

    type MatchResult = {hit: true, match: RegExpExecArray, loc: common.EntityLocation} | {hit: false}
    class FileCursor {
        private absOffset=0
        private line=0
        private column=0
        private readonly contents: string
        readonly filelocation: FileLocation
    
        constructor(contents: string, location: FileLocation) {
            this.contents = contents
            this.filelocation = location
        }
        
        isDone(): boolean {
            return this.absOffset >= this.contents.length
        }
    
        tryMatch(regex: RegExp): MatchResult {
            if (!regex.source.startsWith("^")) {
                throw new Error(`${regex.source} must match only the start of the string`)
            }
            const match = regex.exec(this.contents.slice(this.absOffset))
            if (match !== null) {
                const startLineNumber = this.line
                const startColNumber = this.column

                if(match.groups && match.groups.name && symbolRegex.test(match.groups.name)) {
                    throw new Error(`Entities may not be named after reserved symbols: Line: ${startLineNumber}\n\n${match[0]}`)

                }
                const matchStr = match[0]
                for(let i = 0; i < matchStr.length; ++i) {
                    if (matchStr[i] === "\n") {
                        this.line += 1
                        this.column = 0
                    } else {
                        this.column += 1
                    }
                }
                this.absOffset += matchStr.length
                return {
                    hit: true,
                    match,
                    loc: {
                        startColNumber,
                        startLineNumber,
                        endColNumber: this.column,
                        endLineNumber: this.line
                    }
                }
    
            } else {
                return {hit: false}
            }
        }

        getPositionHint(): string {
            return this.contents.slice(this.absOffset, this.absOffset + 20)
        }
    }

        
    export function extractAllFileEntities(contents: string, location: FileLocation): File {
        const cursor = new FileCursor(contents, location)
        const children = extractChildren<"File">(cursor, completeParserV2, {Enum: true, Struct: true, Function: true, StoreDefinition: true})
        if (cursor.tryMatch(/^\s*/).hit && cursor.isDone()) {
            return {
                kind: "File",
                loc: cursor.filelocation,
                children
            }
        }
        throw Error(`Failed to parse file entirely: ${JSON.stringify(location)}\n${cursor.getPositionHint()}`) 
    }

    type EntityOf<K extends WithChildren["kind"]> = Extract<WithChildren, {kind: K}>
    
    function extractChildren<K extends WithChildren["kind"]>(cursor: FileCursor, parserSet: CompleteParserV2, accepts: ChildrenDescription<EntityOf<K>>): EntityOf<K>["children"] {
        let tryExtractChild = true 
        const children: any = {}
        for (const k in accepts) {
            children[k] = []
        }
    
        while (tryExtractChild) {
            tryExtractChild = false
            for (const key in accepts) {
                
                const child = tryExtractEntity(cursor, 
                    key as keyof CompleteParserV2, 
                    parserSet)
                if (child !== undefined) {
                    tryExtractChild = true
                    
                    children[key].push(child)
                    break
                }
            }
        }
        return children
    }


    function extractToCompositeEntity<P extends AggregationParserV2<any>>(cursor: FileCursor, parser: P, parserSet: CompleteParserV2): Exclude<AnyEntity, File> | undefined {
        const m = cursor.tryMatch(parser.startRegex)
        if (!m.hit) {
            return undefined
        }
        
        const children = extractChildren(cursor, parserSet, parser.hasMany)
        const end = cursor.tryMatch(parser.endRegex)
        if (end.hit) {
            return parser.assemble(m.match, end.match, m.loc, children)
        }

        throw new Error(`Unable to parse end for entity: ${parser.endRegex.source}\n${cursor.getPositionHint()}`)
    }

    type AnyEntity = 
        File | 
        Struct | 
        Field | 
        common.Enum | 
        common.EnumMember | 
        FieldType | 
        CustomTypeEntity | 
        Function |
        FunctionBody |
        ReturnTypeSpec |
        Parameter | 
        common.VoidReturn |
        ReturnStatement | 
        Statement |
        UnaryParameterType |
        NoParameter |
        UnaryParameter | 
        StoreDefinition |
        Append |
        VariableReference |
        Returnable |
        Nothing |
        Assignable |
        VariableCreation

    type WithChildren = Extract<AnyEntity, {children: any}>
    type WithDependentClause= Extract<AnyEntity, {part: any}>


    function tryExtractEntity<K extends keyof ParserMap>(cursor: FileCursor, kind: K, parserSet: ParserMap): Exclude<AnyEntity, File> | undefined {
        const parser = parserSet[kind] as AggregationParserV2<any> | LeafParserV2<any> | ConglomerateParserV2<any> | PolymorphParser<any>
        switch(parser.kind) {
            case "aggregate":
                
                return extractToCompositeEntity(cursor, 
                    parser, 
                    parserSet)

            case "leaf":
                const match = cursor.tryMatch(parser.regex)
                if (match.hit) {
                    return parser.assemble(match.match, match.loc)
                }
                return undefined

            case "conglomerate":
                
                const start = cursor.tryMatch(parser.startRegex)
                if (!start.hit) {
                    return undefined
                }
                const part: any = {}
                const orderableMap: any = {}
                Object.entries(parser.requiresOne).forEach((v) => orderableMap[v[0]] = v[1].order)
                new Ordering(orderableMap).order.forEach(req => {
                    const childdef = parser.requiresOne[req]
                    if (childdef.beforeRegex !== undefined) {
                        if (!cursor.tryMatch(childdef.beforeRegex).hit) {
                            throw new Error(`Unable to parse prefix of ${req} for ${kind}`)
                        }
                    }

                    const depMatch = tryExtractEntity(cursor, req, parserSet)
                    if (depMatch === undefined) {
                        throw new Error(`Unable to parse required ${req} entity at ${JSON.stringify(start.loc)}\n\n ${cursor.getPositionHint()}`)
                    }
                    if (childdef.afterRegex !== undefined) {
                        if (!cursor.tryMatch(childdef.afterRegex).hit) {
                            throw new Error(`Unable to parse suffix of ${req} for ${kind}`)
                        }
                    }
                    part[req] = depMatch
                })

                const end = cursor.tryMatch(parser.endRegex)
                if (!end.hit) {
                    throw new Error(`Unable to find end of entity for ${kind} at ${cursor.getPositionHint()}`)
                }
                return parser.assemble(start.match, end.match, start.loc, part)

            case "polymorph":
                const order = new Ordering(parser.priority).order 
                for (let i = 0; i < order.length; i++) {
                    const elt = order[i];
                    const ent = tryExtractEntity(cursor, 
                        elt, 
                        parserSet)
                    if (ent !== undefined) {
                        return {kind: parser.groupKind, differentiate:() => ent as any}
                    }
                }
                return undefined

                
            default: assertNever(parser)

        }
        
    }

    type ChildrenDescription<K extends WithChildren> = Record<keyof K["children"], true>

    class Ordering<K extends keyof CompleteParserV2> {
        readonly order: K[]

        constructor(priorityMap: Record<K, number>) {
            const o = Object.entries(priorityMap) as [K, number][]
            this.order = o.sort((a, b) => a[1] - b[1]).map(a => a[0])
        }
    }

    type AggregationParserV2<K extends WithChildren> = Readonly<{
        kind: "aggregate"
        startRegex: RegExp
        assemble(start: RegExpExecArray, end: RegExpExecArray, loc: common.EntityLocation, children: K["children"]): K | undefined
        endRegex: RegExp
        hasMany: ChildrenDescription<K>,
    }>

    type LeafParserV2<K extends AnyEntity> = Readonly<{
        kind: "leaf"
        regex: RegExp
        assemble(c: RegExpExecArray, loc: common.EntityLocation): K | undefined
    }>

    type ConglomerateChildParseDefinition = Readonly<{
        beforeRegex?: RegExp
        afterRegex?: RegExp
        order: number
    }>
    type ConglomerateParserV2<K extends WithDependentClause> = Readonly<{
        kind: "conglomerate"
        startRegex: RegExp
        assemble(start: RegExpExecArray, end: RegExpExecArray, loc: common.EntityLocation, part: K["part"]): K | undefined
        endRegex: RegExp
        requiresOne: Record<Extract<keyof CompleteParserV2, keyof K["part"]>, ConglomerateChildParseDefinition>
    }>

    type PolymorphicEntity = Extract<AnyEntity, {differentiate(): any}>
    type PolymorphParser<K extends PolymorphicEntity> = {
        kind: "polymorph"
        // Ordering types perform the sort at startup. 
        // We use an object rather than all possible orderings of the kinds due to limitations of typescript.
        // The best we could do in typescript is an array of our union of kinds.
        // This is undesirable because you can compile a polymorphic type that hasn't prioritized all of its implementations.
        // Typescript does not have a way to go from a union to all possible ordering of union members, which is what we would want.
        // Further reading: https://github.com/Microsoft/TypeScript/issues/13298 
        // More reading: https://github.com/microsoft/TypeScript/issues/26223#issuecomment-513187373
        priority: Record<Extract<keyof CompleteParserV2, ReturnType<K["differentiate"]>["kind"]>, number>
        groupKind: K["kind"]
    }

    type ToFullEntity<K extends common.EntityKinds> = Extract<AnyEntity, {kind: K}>
    type SelectParserType<E extends AnyEntity> = E extends WithChildren ? AggregationParserV2<E> : (
        E extends WithDependentClause ? ConglomerateParserV2<E> : 
            E extends PolymorphicEntity ? PolymorphParser<E> :
                E extends Exclude<AnyEntity, WithDependentClause | WithChildren> ? LeafParserV2<E> : never
    )

    type GetAllDependencies<E extends keyof ParserMap> = E extends WithChildren["kind"] ? keyof Extract<WithChildren, {kind: E}>["children"] :
        E extends WithDependentClause["kind"] ? keyof Extract<WithDependentClause, {kind: E}>["part"] : 
            E extends PolymorphicEntity["kind"] ? ReturnType<Extract<Extract<PolymorphicEntity, {differentiate: any}>, {kind: E}>["differentiate"]>["kind"] : never
    
    type ParserMap = {
        [P in Exclude<AnyEntity, File>["kind"]]:  SelectParserType<ToFullEntity<P>>
    }

    type CompleteParserV2 = ParserMap & {
        [P in keyof ParserMap]: {
            [Q in Exclude<GetAllDependencies<P>, keyof ParserMap>]: Q extends never ? {} : "This entity needs to be added to the AnyEntity union"
        }
    }

    const completeParserV2: CompleteParserV2 = {
        Enum: {
            kind: "aggregate",
            startRegex: /^\s*enum +(?<name>[a-zA-Z_]\w*) *{/,
            assemble(start, end, loc, children): common.Enum | undefined {
                return {
                    kind: "Enum",
                    name: start.groups.name,
                    loc,
                    children
                }
            },
            endRegex:/^\s*}/,
            hasMany: {EnumMember: true}
        },
        
        EnumMember: {
            kind: "leaf",
            regex: /^\s*(?<name>[a-zA-Z_]\w*)(,|\s)/,
            assemble(c, loc): common.EnumMember | undefined {

                return{
                    kind: "EnumMember",
                    name: c.groups.name,
                    loc
                }   
            }
        },


        FieldType: {
            kind: "polymorph",
            priority: {
                CustomType: 2
            },
            groupKind: "FieldType"
        },

        Field: {
            kind: "conglomerate",
            startRegex: /^\s*(?<name>[_A-Za-z]+[\w]*): */,
            endRegex: /^\s*(,|\n|(?= *}))/,
            assemble(start, end, loc, part): Field | undefined {
                return {
                    kind: "Field",
                    name: start.groups.name,
                    loc,
                    part
                }
            },
            requiresOne: {
                FieldType: {order: 1}
            },
        },

        Struct: {
            kind: "aggregate",
            startRegex: /^\s*struct +(?<name>[a-zA-Z_]\w*) *{/,
            assemble(start, end, loc, children): Struct | undefined {
                return {
                    kind: "Struct",
                    name: start.groups.name,
                    loc,
                    children
                }
            },
            endRegex:/^\s*}/,
            hasMany: {Field: true}
        },
        CustomType: {
            kind: "leaf",
            regex: /^ *((?<modifier>Array|Optional)<)? *(?<type>[_A-Za-z]+[\w]*) *(?<closer>>)?/,
            assemble(match, loc): CustomTypeEntity | undefined {
                let modification: common.TypeModification = "none"
                if (match.groups.modifier && !match.groups.closer) {
                    return undefined
                }

                if (match.groups.modifier === "Array") {
                    modification = "array"
                } else if (match.groups.modifier === "Optional") {
                    modification = "optional"
                }
                return {
                    kind: "CustomType",
                    loc,
                    type: match.groups.type,
                    modification
                }
            }
        },
        Function: {
            kind: "conglomerate",
            startRegex: /^\s*function +(?<name>[a-zA-Z_]\w*)/,
            endRegex: /^/,
            assemble(start, end, loc, part): Function | undefined {
                return {
                    kind: "Function",
                    loc,
                    name: start.groups.name,
                    part
                }
            },
            requiresOne: {
                FunctionBody: {order: 3}, 
                Parameter: {order: 1}, 
                ReturnTypeSpec: {
                    beforeRegex: /^ *:?/,
                    order: 2
                }
            }
        },
        ReturnTypeSpec: {
            kind: "polymorph",
            groupKind: "ReturnTypeSpec",
            priority: {CustomType: 2, VoidReturnType: 3}
        },
        Parameter: {
            kind: "polymorph",
            groupKind: "Parameter",
            priority: { UnaryParameter: 2, NoParameter: 1}
        },

        NoParameter: {
            kind: "leaf",
            regex: /^\(\)/,
            assemble(c, loc) {
                return {
                    kind: "NoParameter",
                    loc
                }
            }
        },

        UnaryParameter: {
            kind: "conglomerate",
            startRegex: /^\(\s*(?<name>[a-zA-Z_]\w*): */,
            endRegex: /^\s*\) */,
            requiresOne: {UnaryParameterType: {order: 1}},
            assemble(start, end, loc, part) {
                return {
                    kind: "UnaryParameter",
                    name: start.groups.name,
                    loc, 
                    part,
                }
            }

        },

        FunctionBody: {
            kind: "aggregate",
            startRegex: /^\s*{/,
            endRegex: /^\s*}/,
            assemble(start, end, loc, children): FunctionBody | undefined {
                return {
                    kind: "FunctionBody",
                    loc,
                    children
                }
            },
            hasMany: {Statement: true}
        },
        UnaryParameterType: {
            kind: "polymorph",
            priority: {CustomType: 2},
            groupKind: "UnaryParameterType"
        },
        VoidReturnType: {
            kind: "leaf",
            regex: /^\s*(?=\{)/,
            assemble(c, loc) {
                return {
                    kind: "VoidReturnType",
                }
            }
        },
        Statement: {
            kind: "polymorph",
            groupKind: "Statement",
            priority: {ReturnStatement: 1, Append: 2, VariableCreation: 3}
        },
        ReturnStatement: {
            kind: "conglomerate",
            startRegex: /^\s*return +/,
            endRegex: /^/,
            requiresOne: {
                Returnable: {order: 1}
            },
            assemble(start, end, loc, part) {
                return {
                    kind: "ReturnStatement",
                    loc,
                    part
                }
            }
        },
        StoreDefinition: {
            kind: "conglomerate",
            startRegex: /^\s*(?<name>[a-zA-Z]+):\s*/,
            endRegex: /^\s*=\s*\[\]/,
            requiresOne: {
                CustomType: {order: 1}
            },
            assemble(start, end, loc, part) {
                return {
                    kind: "StoreDefinition",
                    loc: loc,
                    name: start.groups.name,
                    part
                }
            }
        },
        Append: {
            kind: "leaf",
            regex: /^\s*(?<storeName>[a-zA-Z]+)\.append\(\s*(?<variableName>[a-zA-Z_]\w*)\s*\)\s*/,
            assemble(c, loc) {
                return {
                    kind: "Append",
                    loc,
                    variableName: c.groups.variableName,
                    storeName: c.groups.storeName
                }
            }
        },
        VariableReference: {
            kind: "leaf",
            regex: /^\s*(?<name>[a-zA-Z_]\w*)/,
            assemble(c, loc) {
                return {
                    kind: "VariableReference",
                    loc,
                    val: c.groups.name
                }
            }
        },
        Returnable: {
            kind: "polymorph",
            priority: {
                Assignable: 1,
                Nothing: 2
            },
            groupKind: "Returnable"
        },
        Nothing: {
            kind: "leaf",
            regex: /^/,
            assemble() {
                return {
                    kind: "Nothing"
                }
            }
        },
        VariableCreation: {
            kind: "conglomerate",
            startRegex: /^\s*(?<name>[a-zA-Z_]\w*) *:/,
            endRegex: /^/,
            assemble(start, end, loc, part) {
                return {
                    kind: "VariableCreation",
                    name: start.groups.name,
                    part,
                    loc
                }
            },
            requiresOne: {
                CustomType: {
                    afterRegex: /^ *=/,
                    order: 1
                },
                Assignable: {
                    order: 2
                }
            }
        },
        Assignable: {
            kind: "polymorph",
            priority: {
                VariableReference: 1
            },
            groupKind: "Assignable"
        }
    }
}