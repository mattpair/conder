import { Primitives, PrimitiveUnion, Symbol } from './lexicon';
import { Classified, assertNever } from './util/classifying';
import { FileLocation } from "./util/filesystem";
import {BaseConduitFile, Enum, EntityLocation, BaseField, BaseMsg, BaseImport, EnumMember, EntityKind, BaseType} from './entity/basic'


export namespace Parse {
    export type File = BaseConduitFile<Message, Enum, Import>
    
    export type Type = BaseType<{val: Classified<"primitive", PrimitiveUnion> | Classified<"deferred", {from?: string, type: string}>}>
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
        const children = extractChildren(cursor, completeParserV2, {Enum: true, Message: true, Import: true})
        if (cursor.tryMatch(/^\s*/).hit && cursor.isDone) {
            return {
                kind: EntityKind.File,
                loc: cursor.filelocation,
                //@ts-ignore
                children
            }
        }
        throw Error(`Failed to parse file entirely: ${JSON.stringify(location)}`) 
    }

    
    function extractChildren<K extends WithChildren>(cursor: FileCursor, parserSet: CompleteParserV2, accepts: ChildrenDescription<K>): Pick<K, "children"> {
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


    function extractToCompositeEntity(cursor: FileCursor, kind: Exclude<WithChildren, File>["kind"], parserSet: CompleteParserV2): WithChildren | undefined {
        const parser = parserSet[kind]
        const m = cursor.tryMatch(parser.startRegex)
        if (!m.hit) {
            return undefined
        }
        const prek = parser.parseStart(m.match) 
        const children = extractChildren(cursor, parserSet, parser.hasMany)
        const end = cursor.tryMatch(parser.endRegex)
        if (end.hit) {
            return {
                kind,
                loc: m.loc,
                ...prek,
                //@ts-ignore
                children
            }
        }

        throw new Error(`Unable to parse end for entity: ${kind} \n\n ${JSON.stringify(cursor)}\n${cursor.getPositionHint()}`)
    }

    type AnyEntity = File | Message | Import | Field | Enum | EnumMember | Type
    type WithChildren = Extract<AnyEntity, {children: any}>
    type WithDependentClause= Extract<AnyEntity, {peer: any}>


    type OnlyCustomFieldsOf<K extends AnyEntity> = Omit<K, "loc" | "children" | "peer" | "kind">
    type AnyParser = LeafParserV2<Exclude<AnyEntity, WithChildren | WithDependentClause>> 
    | CompositeParserV2<WithChildren> 
    | ChainParserV2<WithDependentClause>

    function tryExtractEntity(cursor: FileCursor, kind: Exclude<AnyEntity, File>["kind"], parserSet: CompleteParserV2): AnyEntity | undefined {
        const parser = parserSet[kind]
        switch(parser.kind) {
            case "composite":
                
                return extractToCompositeEntity(cursor, 
                    //@ts-ignore we know this kind is a composite because it gave us a composite parser.
                    kind, 
                    parserSet)
            case "leaf":
                const match = cursor.tryMatch(parser.regex)
                if (match.hit) {
                    return Object.assign(parser.parse(match.match), {loc: match.loc, kind}) as AnyEntity
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
                const prek = parser.assemble(start.match, end.match)
                return Object.assign({loc: start.loc, peer: depMatch, kind}, prek) as AnyEntity

            default: assertNever(parser)

        }
        
    }

    type ChildrenDescription<K extends WithChildren> = Record<keyof K["children"], true>

    type CompositeParserV2<K extends WithChildren> = Readonly<{
        kind: "composite"
        startRegex: RegExp
        parseStart(c: RegExpExecArray): OnlyCustomFieldsOf<K> | undefined
        endRegex: RegExp
        hasMany: ChildrenDescription<K>,
    }>

    type LeafParserV2<K extends Exclude<AnyEntity, WithChildren | WithDependentClause>> = Readonly<{
        kind: "leaf"
        regex: RegExp
        parse(c: RegExpExecArray): OnlyCustomFieldsOf<K> | undefined
    }>
    type ChainParserV2<K extends WithDependentClause> = Readonly<{
        kind: "chain"
        startRegex: RegExp
        assemble(start: RegExpExecArray, end: RegExpExecArray): OnlyCustomFieldsOf<K> | undefined
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
            parseStart(c: RegExpExecArray): OnlyCustomFieldsOf<Enum> | undefined {
                return {
                    name: c.groups.name,
                }
            },
            endRegex:/^\s*}/,
            hasMany: {EnumMember: true}
        },
        
        EnumMember: {
            kind: "leaf",
            regex: /^\s*(?<name>[a-zA-Z_]\w*)(,|\s)/,
            parse(c: RegExpExecArray): OnlyCustomFieldsOf<EnumMember> | undefined {
                return{
                    name: c.groups.name
                }   
            }
        },

        Import: {
            kind: "leaf",
            regex: /^\s*import +'(?<presentDir>\.\/)?(?<location>[\w \.\/]*)' +as +(?<name>[_A-Za-z]+[\w]*)/,
            parse(c: RegExpExecArray): OnlyCustomFieldsOf<Import> | undefined {
                return {
                    fromPresentDir: c.groups.presentDir !== undefined,
                    name: c.groups.name,
                    filename: c.groups.location
                }
            }
        },

        Type: {
            kind: 'leaf',
            regex: /^((?<from>[_A-Za-z]+[\w]*)\.)?(?<type>[_A-Za-z]+[\w]*) +/,
            parse(c): OnlyCustomFieldsOf<Type> | undefined {
                const prim = Primitives.find(p => p === c.groups.type)
                const val = prim !== undefined ? {kind: "primitive", val: prim} : {kind: "deferred", val: {from: c.groups.from, type: c.groups.type}}

                return {
                    kind: EntityKind.Type,
                    // @ts-ignore
                    val 
                }
            }
        },

        Field: {
            kind: "chain",
            startRegex: /^\s*(?<optional>optional)? +(?!\s*})/,
            endRegex: /^(?<name>[_A-Za-z]+[\w]*)(,|\n)/,
            assemble(start, end): OnlyCustomFieldsOf<Field> | undefined {
                return {
                    name: end.groups.name,
                    isRequired: start.groups.optional === undefined,
                }
            },
            requiresA: EntityKind.Type,
        },

        Message: {
            kind: "composite",
            startRegex: /^\s*message +(?<name>[a-zA-Z_]\w*) *{/,
            parseStart(c: RegExpExecArray): OnlyCustomFieldsOf<Message> | undefined {
                return {
                    name: c.groups.name,
                }
            },
            endRegex:/^\s*}/,
            hasMany: {Field: true}
        },
    }
}