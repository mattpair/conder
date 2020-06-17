import { Primitives, Symbol } from './lexicon';
import { assertNever } from './util/classifying';
import { FileLocation } from "./util/filesystem";
import {BaseConduitFile, Enum, EntityLocation, BaseField, BaseMsg, BaseImport, EnumMember, BaseFieldType, PrimitiveEntity, IntrafileEntity, IntrafileEntityKinds, EntityKinds} from './entity/basic'


export namespace Parse {
    export type File = BaseConduitFile<Message, Enum, Import>
    type CustomTypeEntity = IntrafileEntity<"CustomType", {from?: string, type: string}>
    export type TypeUnion = () => PrimitiveEntity | CustomTypeEntity
    export type FieldType = BaseFieldType<TypeUnion>
    export type Field = BaseField<FieldType>

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
        const children = extractChildren<"File">(cursor, completeParserV2, {Enum: true, Message: true, Import: true})
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
                    key as IntrafileEntityKinds, 
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

        throw new Error(`Unable to parse end for entity: ${JSON.stringify(cursor)}\n${cursor.getPositionHint()}`)
    }

    type AnyEntity = File | Message | Import | Field | Enum | EnumMember | FieldType | CustomTypeEntity | PrimitiveEntity
    type WithChildren = Extract<AnyEntity, {children: any}>
    type WithDependentClause= Extract<AnyEntity, {peer: any}>


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

                const depMatch = tryExtractEntity(cursor, parser.requiresA, parserSet)
                if (depMatch === undefined) {
                    throw new Error(`Unable to parse required type entity at ${JSON.stringify(start.loc)}`)
                }

                const end = cursor.tryMatch(parser.endRegex)
                if (!end.hit) {
                    throw new Error(`Unable to find end of entity at ${JSON.stringify(start.loc)}`)
                }
                return parser.assemble(start.match, end.match, start.loc, depMatch)

            case "polymorph":
                
                for (let i = 0; i < parser.priority.length; i++) {
                    const kind = parser.priority[i];
                    const ent = tryExtractEntity(cursor, 
                        kind, 
                        parserSet) as any
                    if (ent !== undefined) {
                        return {kind: parser.groupKind, differentiate:() => ent}
                    }
                }
                throw new Error(`Failure parsing polymorphic entity: ${cursor.getPositionHint()}`)

                
            default: assertNever(parser)

        }
        
    }

    type ChildrenDescription<K extends WithChildren> = Record<keyof K["children"], true>

    type AggregationParserV2<K extends WithChildren> = Readonly<{
        kind: "aggregate"
        startRegex: RegExp
        assemble(start: RegExpExecArray, end: RegExpExecArray, loc: EntityLocation, children: K["children"]): K | undefined
        endRegex: RegExp
        hasMany: ChildrenDescription<K>,
    }>

    type LeafParserV2<K extends AnyEntity> = Readonly<{
        kind: "leaf"
        regex: RegExp
        assemble(c: RegExpExecArray, loc: EntityLocation): K | undefined
    }>
    type ConglomerateParserV2<K extends WithDependentClause> = Readonly<{
        kind: "conglomerate"
        startRegex: RegExp
        assemble(start: RegExpExecArray, end: RegExpExecArray, loc: EntityLocation, peer: K["peer"]): K | undefined
        endRegex: RegExp
        requiresA: Extract<IntrafileEntityKinds, K["peer"]["kind"]>
    }>

    type PolymorphicEntity = Extract<AnyEntity, {differentiate(): any}>
    type PolymorphParser<K extends PolymorphicEntity> = {
        kind: "polymorph"
        priority: Extract<IntrafileEntityKinds, ReturnType<K["differentiate"]>["kind"]>[]
        
        groupKind: K["kind"]
    }

    type ToFullEntity<K extends EntityKinds> = Extract<AnyEntity, {kind: K}>
    type SelectParserType<E extends AnyEntity> = E extends WithChildren ? AggregationParserV2<E> : (
        E extends WithDependentClause ? ConglomerateParserV2<E> : 
            E extends PolymorphicEntity ? PolymorphParser<E> :
                E extends Exclude<AnyEntity, WithDependentClause | WithChildren> ? LeafParserV2<E> : never
    )

    type GetAllDependencies<E extends keyof ParserMap> = E extends WithChildren["kind"] ? keyof Extract<WithChildren, {kind: E}>["children"] :
        E extends WithDependentClause["kind"] ? Extract<WithDependentClause, {kind: E}>["peer"]["kind"] : 
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
            assemble(start, end, loc, children): Enum | undefined {
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
            assemble(c, loc): EnumMember | undefined {

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
            priority: ["Primitive", "CustomType"],
            groupKind: "FieldType"
        },

        Field: {
            kind: "conglomerate",
            startRegex: /^\s*(?<optional>optional)? +(?!\s*})/,
            endRegex: /^(?<name>[_A-Za-z]+[\w]*)(,|\n)/,
            assemble(start, end, loc, peer): Field | undefined {
                return {
                    kind: "Field",
                    name: end.groups.name,
                    isRequired: start.groups.optional === undefined,
                    loc,
                    peer
                }
            },
            requiresA: "FieldType",
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
            regex: /^((?<from>[_A-Za-z]+[\w]*)\.)?(?<type>[_A-Za-z]+[\w]*) +/,
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
            assemble(match, loc): PrimitiveEntity | undefined {
                return {
                    kind: "Primitive",
                    loc,
                    val: Primitives.find(p => p === match.groups.val)
                }
            }
        }    
    }
}