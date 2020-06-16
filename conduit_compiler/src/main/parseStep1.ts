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

    type CompleteParser = ParserTreeNode<File>
    const completeParse: CompleteParser = {
        kind: "composite",
        startRegex: /^/,
        parseStart(c: RegExpExecArray): WithoutAutoFilledFields<File> | undefined {
            return {kind: EntityKind.File}
        },
        endRegex: /^\s*/,
        sub: {
            Message: {
                kind: "composite",
                startRegex: /^\s*message +(?<name>[a-zA-Z_]\w*) *{/,
                parseStart(c: RegExpExecArray): WithoutAutoFilledFields<Message> | undefined {
                    return {
                        kind: EntityKind.Message,
                        name: c.groups.name,
                    }
                },
                endRegex:/^\s*}/,

                sub: {
                    Field: {
                        kind: "with dependency",
                        startRegex: /^\s*(?<optional>optional)? +(?!\s*})/,
                        endRegex: /^(?<name>[_A-Za-z]+[\w]*)(,|\n)/,
                        assemble(start, end): WithoutAutoFilledFields<Field> | undefined {
                            return {
                                kind: EntityKind.Field,
                                name: end.groups.name,
                                isRequired: start.groups.optional === undefined,
                            }
                        },
                        sub: {
                            Type: {
                                kind: 'leaf',
                                regex: /^((?<from>[_A-Za-z]+[\w]*)\.)?(?<type>[_A-Za-z]+[\w]*) +/,
                                parse(c): WithoutAutoFilledFields<Type> | undefined {
                                    const prim = Primitives.find(p => p === c.groups.type)
                                    const val = prim !== undefined ? {kind: "primitive", val: prim} : {kind: "deferred", val: {from: c.groups.from, type: c.groups.type}}

                                    return {
                                        kind: EntityKind.Type,
                                        // @ts-ignore
                                        val 
                                    }
                                }
                            }

                        }
                    }
                }
            },
            Enum: {
                kind: "composite",
                startRegex: /^\s*enum +(?<name>[a-zA-Z_]\w*) *{/,
                parseStart(c: RegExpExecArray): WithoutAutoFilledFields<Enum> | undefined {
                    return {
                        kind: EntityKind.Enum,
                        name: c.groups.name,
                    }
                },
                endRegex:/^\s*}/,
                sub: {
                    EnumMember: {
                        kind: "leaf",
                        regex: /^\s*(?<name>[a-zA-Z_]\w*)(,|\s)/,
                        parse(c: RegExpExecArray): WithoutAutoFilledFields<EnumMember> | undefined {
                            return{
                                kind: EntityKind.EnumMember,
                                name: c.groups.name
                            }   
                        }
                    }
                }
            },
            Import: {
                kind: "leaf",
                regex: /^\s*import +'(?<presentDir>\.\/)?(?<location>[\w \.\/]*)' +as +(?<name>[_A-Za-z]+[\w]*)/,
                parse(c: RegExpExecArray): WithoutAutoFilledFields<Import> | undefined {
                    return {
                        kind: EntityKind.Import,
                        fromPresentDir: c.groups.presentDir !== undefined,
                        name: c.groups.name,
                        filename: c.groups.location
                    }
                }
            }
        }
    }

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
        const prepref = completeParse.parseStart(undefined)
        const pref = Object.assign(prepref, {
            loc: cursor.filelocation
        })
        const f = attachChildren(cursor, completeParse, pref)
        if (cursor.tryMatch(completeParse.endRegex).hit && cursor.isDone) {
            return f
        }
        throw Error(`Failed to parse file entirely: ${JSON.stringify(location)}`) 
    }

    function attachChildren<K extends WithChildren>(cursor: FileCursor, parser: CompositeParserNode<K>, prek: Omit<K, "children">): K {
        let tryExtractChild = true 
        const children: any = {}
        for (const k in parser.sub) {
            children[k] = []
        }

        const k = Object.assign(prek, {children}) as K

        while (tryExtractChild) {
            tryExtractChild = false
            for (const key in parser.sub) {
                const c: CompositeParserNode<any> | LeafParserNode<any> | SingleDependencyParserNode<any> = parser.sub[key]
                switch(c.kind) {
                    case "composite":
                        const comp = extractToCompositeEntity(cursor, c)
                        if (comp !== undefined) {
                            //@ts-ignore
                            k.children[key].push(comp)
                            tryExtractChild = true
                        }
                        break
                    case "leaf":
                        const match = cursor.tryMatch(c.regex)
                        if (match.hit) {
                            const leaf = c.parse(match.match)
                            //@ts-ignore
                            k.children[key].push(leaf)
                            tryExtractChild = true
                        }
                        break
                    case "with dependency":
                        const child = extractToEntity(cursor, c)
                        if (child !== undefined) {
                            //@ts-ignore
                            k.children[key].push(child)
                            tryExtractChild = true
                        }
                        break;
                    default: assertNever(c)
                }
                if (tryExtractChild) {
                    break
                }
            }
        }
        return k
    }

    function extractToEntity<K extends WithDependentClause>(cursor: FileCursor, parser: SingleDependencyParserNode<K>): K | undefined {
        const start = cursor.tryMatch(parser.startRegex)
        if (!start.hit) {
            return undefined
        }
        const depMatch = cursor.tryMatch(parser.sub.Type.regex)
        if (!depMatch.hit) {
            throw new Error(`Unable to parse required type entity at ${JSON.stringify(start.loc)}`)
        }
        const predep = parser.sub.Type.parse(depMatch.match)
        const dep = Object.assign({loc: depMatch.loc}, predep)
        const end = cursor.tryMatch(parser.endRegex)
        if (!end.hit) {
            throw new Error(`Unable to find end of entity at ${JSON.stringify(start.loc)}`)
        }
        const prek = parser.assemble(start.match, end.match)
        return Object.assign({loc: start.loc, the: {Type: dep}}, prek) as K
    }


    type NonfileComposite = Exclude<WithChildren, {kind: EntityKind.File}>
    function extractToCompositeEntity<K extends NonfileComposite>(cursor: FileCursor, parser: CompositeParserNode<K>): K | undefined {
        const m = cursor.tryMatch(parser.startRegex)
        if (!m.hit) {
            return undefined
        }
        const prek = parser.parseStart(m.match) 
        const k = attachChildren(cursor, parser, Object.assign(prek, {loc: m.loc} as Omit<K, "children">))
        const end = cursor.tryMatch(parser.endRegex)
        if (end.hit) {
            return k
        }

        throw new Error(`Unable to parse end for entity: ${JSON.stringify(k, null, 2)} \n\n ${JSON.stringify(cursor)}\n${cursor.getPositionHint()}`)
    }

    type AnyEntity = File | Message | Import | Field | Enum | EnumMember | Type
    type WithChildren = Extract<AnyEntity, {children: any}>
    type WithDependentClause= Extract<AnyEntity, {the: any}>

    type CompositeParserTree<ROOT extends WithChildren> ={
        [CHILD in keyof ROOT["children"]]: ParserTreeNode<Extract<AnyEntity, {kind: CHILD}>>
    };
    
    type DependentClauseParserTree<ROOT extends WithDependentClause> = {
        [CHILD in keyof ROOT["the"]]: ParserTreeNode<Extract<AnyEntity, {kind: CHILD}>>
    }

    type CompositeParserNode<ROOT extends WithChildren> = {
        startRegex: RegExp
        parseStart(c: RegExpExecArray): WithoutAutoFilledFields<ROOT> | undefined
        endRegex: RegExp
        sub: CompositeParserTree<ROOT>,
    } & ParserNode<"composite">

    type SingleDependencyParserNode<ROOT extends WithDependentClause> = {
        startRegex: RegExp
        assemble(start: RegExpExecArray, end: RegExpExecArray): WithoutAutoFilledFields<ROOT> | undefined
        endRegex: RegExp
        sub: DependentClauseParserTree<ROOT>,

    } & ParserNode<"with dependency">

    type ParserNode<KIND> = {kind: KIND}
    type LeafParserNode<ROOT extends AnyEntity> =  ParserNode<"leaf"> & { 
        regex: RegExp
        parse(c: RegExpExecArray): WithoutAutoFilledFields<ROOT> | undefined
    }
    type ParserTreeNode<ROOT extends AnyEntity> = ROOT extends WithChildren 
    ? CompositeParserNode<ROOT> 
    : ROOT extends WithDependentClause ? SingleDependencyParserNode<ROOT> : LeafParserNode<ROOT>
    type WithoutAutoFilledFields<K extends AnyEntity> = Omit<K, "loc" | "children" | "the" >
}
