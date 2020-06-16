import { Primitives, PrimitiveUnion, Symbol } from './lexicon';
import { Classified, assertNever } from './util/classifying';
import { FileLocation } from "./util/filesystem";
import {BaseConduitFile, Enum, EntityLocation, BaseField, BaseMsg, BaseImport, EnumMember, EntityKind, BaseType} from './entity/basic'


export namespace Parse {
    export type File = BaseConduitFile<Message, Enum, Import>
    export type TypeUnion = Classified<"primitive", PrimitiveUnion> | Classified<"deferred", {from?: string, type: string}>
    export type Type = BaseType<{val: TypeUnion}>
    export type Field = BaseField<Type>

    export type Message = BaseMsg<Field>
    export type Import = BaseImport<{
        readonly fromPresentDir: boolean
        readonly filename: string
    }>

    const symbolRegex: RegExp = new RegExp(`^(${Object.values(Symbol).join("|")})`)

    type MatchResult = {hit: true, match: RegExpExecArray, loc: EntityLocation} | {hit: false}
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
        const children = extractChildren<EntityKind.File>(cursor, completeParserV2, {Enum: true, Message: true, Import: true})
        if (cursor.tryMatch(/^\s*/).hit && cursor.isDone) {
            return {
                kind: EntityKind.File,
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
                    //@ts-ignore
                    key, 
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


    function extractToCompositeEntity<K extends Exclude<WithChildren, File>["kind"]>(cursor: FileCursor, kind: K, parserSet: CompleteParserV2): EntityOf<K> | undefined {
        //@ts-ignore
        const parser: CompositeParserV2<EntityOf<K>> = parserSet[kind]
        const m = cursor.tryMatch(parser.startRegex)
        if (!m.hit) {
            return undefined
        }
        
        const children: EntityOf<K>['children'] = extractChildren<K>(cursor, parserSet, parser.hasMany)
        const end = cursor.tryMatch(parser.endRegex)
        if (end.hit) {
            //@ts-ignore
            return {
                kind,
                loc: m.loc,
                ...parser.assemble(m.match, end.match),
                children
            }
        }

        throw new Error(`Unable to parse end for entity: ${kind} \n\n ${JSON.stringify(cursor)}\n${cursor.getPositionHint()}`)
    }

    type AnyEntity = File | Message | Import | Field | Enum | EnumMember | Type
    type WithChildren = Extract<AnyEntity, {children: any}>
    type WithDependentClause= Extract<AnyEntity, {peer: any}>


    type OnlyCustomFieldsOf<K extends AnyEntity> = Omit<K, "loc" | "children" | "peer" | "kind">

    function tryExtractEntity<K extends Exclude<AnyEntity, File>["kind"]>(cursor: FileCursor, kind: K, parserSet: CompleteParserV2): ToFullEntity<K> | undefined {
        const parser: CompositeParserV2<any> | LeafParserV2<any> | ChainParserV2<any> = parserSet[kind]
        switch(parser.kind) {
            case "composite":
                //@ts-ignore
                return extractToCompositeEntity<K>(cursor, 
                    kind, 
                    parserSet)
            case "leaf":
                const match = cursor.tryMatch(parser.regex)
                if (match.hit) {
                    return parser.assemble(match.match, match.loc)
                }
                return undefined

            case "chain":
                
                const start = cursor.tryMatch(parser.startRegex)
                if (!start.hit) {
                    return undefined
                }

                const depMatch = tryExtractEntity(cursor, parser.requiresA, parserSet)
                if (depMatch === undefined) {
                    throw new Error(`Unable to parse required type entity at ${JSON.stringify(start.loc)}`)
                }

                const end = cursor.tryMatch(parser.endRegex)
                if (!end.hit) {
                    throw new Error(`Unable to find end of entity at ${JSON.stringify(start.loc)}`)
                }
                return parser.assemble(start.match, end.match, start.loc, depMatch)

            default: assertNever(parser)

        }
        
    }

    type ChildrenDescription<K extends WithChildren> = Record<keyof K["children"], true>

    type CompositeParserV2<K extends WithChildren> = Readonly<{
        kind: "composite"
        startRegex: RegExp
        assemble(start: RegExpExecArray, end: RegExpExecArray): OnlyCustomFieldsOf<K> | undefined
        endRegex: RegExp
        hasMany: ChildrenDescription<K>,
    }>

    type LeafParserV2<K extends Exclude<AnyEntity, WithChildren | WithDependentClause>> = Readonly<{
        kind: "leaf"
        regex: RegExp
        assemble(c: RegExpExecArray, loc: EntityLocation): K | undefined
    }>
    type ChainParserV2<K extends WithDependentClause> = Readonly<{
        kind: "chain"
        startRegex: RegExp
        assemble(start: RegExpExecArray, end: RegExpExecArray, loc: EntityLocation, peer: K["peer"]): K | undefined
        endRegex: RegExp
        requiresA: K["peer"]["kind"]
    }>

    type ToFullEntity<K extends EntityKind> = Extract<AnyEntity, {kind: K}>
    type SelectParserType<E extends AnyEntity> = E extends WithChildren ? CompositeParserV2<E> : (
        E extends WithDependentClause ? ChainParserV2<E> : (
            E extends Exclude<AnyEntity, WithDependentClause | WithChildren> ? LeafParserV2<E> : never)
    )
    
    type CompleteParserV2 = {
        [P in Exclude<AnyEntity, File>["kind"]]:  SelectParserType<ToFullEntity<P>>
    }

    const completeParserV2: CompleteParserV2 = {
        Enum: {
            kind: "composite",
            startRegex: /^\s*enum +(?<name>[a-zA-Z_]\w*) *{/,
            assemble(start, end): OnlyCustomFieldsOf<Enum> | undefined {
                return {
                    name: start.groups.name,
                }
            },
            endRegex:/^\s*}/,
            hasMany: {EnumMember: true}
        },
        
        EnumMember: {
            kind: "leaf",
            regex: /^\s*(?<name>[a-zA-Z_]\w*)(,|\s)/,
            assemble(c, loc): EnumMember | undefined {

                return{
                    kind: EntityKind.EnumMember,
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
                    kind: EntityKind.Import,
                    fromPresentDir: c.groups.presentDir !== undefined,
                    name: c.groups.name,
                    filename: c.groups.location,
                    loc
                }
            }
        },

        Type: {
            kind: 'leaf',
            regex: /^((?<from>[_A-Za-z]+[\w]*)\.)?(?<type>[_A-Za-z]+[\w]*) +/,
            assemble(c, loc): Type | undefined {
                const prim = Primitives.find(p => p === c.groups.type)
                const val: TypeUnion = prim !== undefined ? {kind: "primitive", val: prim} : {kind: "deferred", val: {from: c.groups.from, type: c.groups.type}}

                return {
                    kind: EntityKind.Type,
                    loc,
                    val 
                }
            }
        },

        Field: {
            kind: "chain",
            startRegex: /^\s*(?<optional>optional)? +(?!\s*})/,
            endRegex: /^(?<name>[_A-Za-z]+[\w]*)(,|\n)/,
            assemble(start, end, loc, peer): Field | undefined {
                return {
                    kind: EntityKind.Field,
                    name: end.groups.name,
                    isRequired: start.groups.optional === undefined,
                    loc,
                    peer
                }
            },
            requiresA: EntityKind.Type,
        },

        Message: {
            kind: "composite",
            startRegex: /^\s*message +(?<name>[a-zA-Z_]\w*) *{/,
            assemble(start, end): OnlyCustomFieldsOf<Message> | undefined {
                return {
                    name: start.groups.name,
                }
            },
            endRegex:/^\s*}/,
            hasMany: {Field: true}
        },
    }
}