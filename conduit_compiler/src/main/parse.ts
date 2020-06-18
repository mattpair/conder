import { Primitives, Symbol } from './lexicon';
import { assertNever } from './util/classifying';
import { FileLocation } from "./util/filesystem";
import * as common from './entity/basic'


export namespace Parse {
    export type File = common.BaseConduitFile<Message, common.Enum, Import, Function>
    type CustomTypeEntity = common.IntrafileEntity<"CustomType", {from?: string, type: string}>
    export type TypeUnion = () => common.PrimitiveEntity | CustomTypeEntity
    export type FieldType = common.BaseFieldType<TypeUnion>
    export type Field = common.BaseField<FieldType>
    export type FunctionBody = common.BaseFunctionBody
    export type Parameter = common.BaseParameter<CustomTypeEntity>
    export type ParameterList = common.BaseParameterList<Parameter>
    export type ReturnTypeSpec = common.BaseReturnTypeSpec<() => common.VoidReturn | CustomTypeEntity>
    export type Function = common.BaseFunction<FunctionBody, ReturnTypeSpec, ParameterList>
    export type Message = common.BaseMsg<Field>
    export type Import = common.BaseImport<{
        readonly fromPresentDir: boolean
        readonly filename: string
    }>

    const symbolRegex: RegExp = new RegExp(`^(${Object.values(Symbol).join("|")})`)

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
        const children = extractChildren<"File">(cursor, completeParserV2, {Enum: true, Message: true, Import: true, Function: true})
        if (cursor.tryMatch(/^\s*/).hit && cursor.isDone) {
            return {
                kind: "File",
                loc: cursor.filelocation,
                children
            }
        }
        throw Error(`Failed to parse file entirely: ${JSON.stringify(location)}`) 
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
        Message | 
        Import | 
        Field | 
        common.Enum | 
        common.EnumMember | 
        FieldType | 
        CustomTypeEntity | 
        common.PrimitiveEntity | 
        Function |
        FunctionBody |
        ParameterList |
        ReturnTypeSpec |
        Parameter | 
        common.VoidReturn

    type WithChildren = Extract<AnyEntity, {children: any}>
    type WithDependentClause= Extract<AnyEntity, {part: any}>


    function tryExtractEntity<K extends keyof ParserMap>(cursor: FileCursor, kind: K, parserSet: ParserMap): Exclude<AnyEntity, File> | undefined {
        const parser: AggregationParserV2<any> | LeafParserV2<any> | ConglomerateParserV2<any> | PolymorphParser<any> = parserSet[kind]
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
                parser.requiresOne.order.forEach(req => {
                    const depMatch = tryExtractEntity(cursor, req, parserSet)
                    if (depMatch === undefined) {
                        throw new Error(`Unable to parse required ${req} entity at ${JSON.stringify(start.loc)}\n\n ${cursor.getPositionHint()}`)
                    }
                    part[req] = depMatch
                })

                const end = cursor.tryMatch(parser.endRegex)
                if (!end.hit) {
                    throw new Error(`Unable to find end of entity for ${kind} at ${cursor.getPositionHint()}`)
                }
                return parser.assemble(start.match, end.match, start.loc, part)

            case "polymorph":
                const order = parser.priority.order 
                for (let i = 0; i < order.length; i++) {
                    const elt = order[i];
                    const ent = tryExtractEntity(cursor, 
                        elt, 
                        parserSet)
                    if (ent !== undefined) {
                        return {kind: parser.groupKind, differentiate:() => ent as any}
                    }
                }
                throw new Error(`Failure parsing polymorphic entity: ${cursor.getPositionHint()}`)

                
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
    type ConglomerateParserV2<K extends WithDependentClause> = Readonly<{
        kind: "conglomerate"
        startRegex: RegExp
        assemble(start: RegExpExecArray, end: RegExpExecArray, loc: common.EntityLocation, part: K["part"]): K | undefined
        endRegex: RegExp
        requiresOne: Ordering<Extract<keyof CompleteParserV2, keyof K["part"]>>
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
        priority: Ordering<Extract<keyof CompleteParserV2, ReturnType<K["differentiate"]>["kind"]>>
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

        Import: {
            kind: "leaf",
            regex: /^\s*import +'(?<presentDir>\.\/)?(?<location>[\w \.\/]*)' +as +(?<name>[_A-Za-z]+[\w]*)/,
            assemble(c, loc): Import | undefined {
                return {
                    kind: "Import",
                    fromPresentDir: c.groups.presentDir !== undefined,
                    name: c.groups.name,
                    filename: c.groups.location,
                    loc
                }
            }
        },

        FieldType: {
            kind: "polymorph",
            priority: new Ordering({
                Primitive: 0,
                CustomType: 1
            }),
            groupKind: "FieldType"
        },

        Field: {
            kind: "conglomerate",
            startRegex: /^\s*(?<optional>optional)? +(?!\s*})/,
            endRegex: /^ *(?<name>[_A-Za-z]+[\w]*)(,|\n)/,
            assemble(start, end, loc, part): Field | undefined {
                return {
                    kind: "Field",
                    name: end.groups.name,
                    isRequired: start.groups.optional === undefined,
                    loc,
                    part
                }
            },
            requiresOne: new Ordering({
                FieldType: 1
            }),
        },

        Message: {
            kind: "aggregate",
            startRegex: /^\s*message +(?<name>[a-zA-Z_]\w*) *{/,
            assemble(start, end, loc, children): Message | undefined {
                return {
                    kind: "Message",
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
            regex: /^((?<from>[_A-Za-z]+[\w]*)\.)?(?<type>[_A-Za-z]+[\w]*)/,
            assemble(match, loc): CustomTypeEntity | undefined {
                return {
                    kind: "CustomType",
                    loc,
                    from: match.groups.from,
                    type: match.groups.type
                }
            }
        },
        Primitive: {
            kind: "leaf",
            regex: new RegExp(`^(?<val>(${Primitives.join("|")})) +`),
            assemble(match, loc): common.PrimitiveEntity | undefined {
                return {
                    kind: "Primitive",
                    loc,
                    val: Primitives.find(p => p === match.groups.val)
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
            requiresOne: new Ordering({FunctionBody: 3, ParameterList: 1, ReturnTypeSpec: 2})
        },
        ReturnTypeSpec: {
            kind: "polymorph",
            groupKind: "ReturnTypeSpec",
            priority: new Ordering({CustomType: 2, VoidReturnType: 3})
        },
        ParameterList: {
            kind: "aggregate",
            startRegex: /^\s*\(/,
            endRegex: /^\s*\)\s*/,
            assemble(start, end, loc, children): ParameterList | undefined {
                return {
                    kind: "ParameterList",
                    loc,
                    children
                }
            },
            hasMany: {Parameter: true}
        },

        FunctionBody: {
            kind: "leaf",
            regex: /^\s*{\s*}/,
            assemble(c, loc): FunctionBody | undefined {
                return {
                    kind: "FunctionBody",
                    loc
                }
            }
        },
        Parameter: {
            kind: "conglomerate",
            startRegex: /^\s*(?<name>[a-zA-Z_]\w*): */,
            endRegex: /^\s*,?/,
            assemble(start, end, loc, part): Parameter | undefined {
                return {
                    kind: "Parameter",
                    name: start.groups.name,
                    loc,
                    part
                }
            },
            requiresOne: new Ordering({CustomType: 1})
        },
        VoidReturnType: {
            kind: "leaf",
            regex: /^\s*(?=\{)/,
            assemble(c, loc) {
                return {
                    kind: "VoidReturnType",
                    loc
                }
            }
        }
    }
    type aaa = Ordering<"CustomType" | "VoidReturnType">

    type bbbb = Record<"CustomType" | "VoidReturnType", true>
    const a: aaa = new Ordering({})
}