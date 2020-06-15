import { Primitives, PrimitiveUnion, Symbol } from './lexicon';
import { Classified, assertNever } from './util/classifying';
import { FileLocation } from "./util/filesystem";
import {BaseConduitFile, Enum, EntityLocation, BaseField, BaseMsg, BaseImport, EnumMember, EntityKind} from './entity/basic'


export namespace Parse {
    export type File = BaseConduitFile<Message, Enum, Import>
    
    export type FieldType = Classified<"primitive", PrimitiveUnion> | Classified<"deferred", {from?: string, type: string}>
    export type Field = BaseField<FieldType>

    export type Message = BaseMsg<Field>
    export type Import = BaseImport<{
        readonly fromPresentDir: boolean
        readonly filename: string
    }>

    type CompleteParser = ParserTreeNode<File>
    const completeParse: CompleteParser = {
        kind: "composite",
        startRegex: /^/,
        parseStart(c: RegExpExecArray): WithoutLocation<File> | undefined {
            return {kind: EntityKind.File, children: {Enum: [], Message: [], Import: []}}
        },
        endRegex: /^\s*/,
        parseEnd(c): IsEndParseSuccessful {
            return c.length > 0 ? "success" : "fail"
        },
        sub: {
            Message: {
                kind: "composite",
                startRegex: /^\s*message +(?<name>[a-zA-Z_]\w*) *{/,
                parseStart(c: RegExpExecArray): WithoutLocation<Message> | undefined {
                    return {
                        kind: EntityKind.Message,
                        name: c.groups.name,
                        children: {
                            Field: []
                        }
                    }
                },
                endRegex:/^\s*}/,
                parseEnd(c: RegExpExecArray): IsEndParseSuccessful {
                    return c.length > 0 ? "success" : "fail"
                },

                sub: {
                    Field: {
                        kind: "leaf",
                        regex: /^\s*(?<optional>optional)? +((?<from>[_A-Za-z]+[\w]*)\.)?(?<type>[_A-Za-z]+[\w]*) +(?<name>[_A-Za-z]+[\w]*)(,|\n)/,
                        parse(c: RegExpExecArray): WithoutLocation<Field> | undefined {

                            const prim = Primitives.find(p => p === c.groups.type)
                            return {
                                kind: EntityKind.Field,
                                name: c.groups.name,
                                isRequired: c.groups.optional === undefined,
                                fType: prim !== undefined ? {kind: "primitive", val: prim} : {kind: "deferred", val: {
                                    from: c.groups.from,
                                    type: c.groups.type
                                }}
                            }
                        }
                    }
                }
            },
            Enum: {
                kind: "composite",
                startRegex: /^\s*enum +(?<name>[a-zA-Z_]\w*) *{/,
                parseStart(c: RegExpExecArray): WithoutLocation<Enum> | undefined {
                    return {
                        kind: EntityKind.Enum,
                        name: c.groups.name,
                        children: {
                            EnumMember: []
                        }
                    }
                },
                endRegex:/^\s*}/,
                parseEnd(c: RegExpExecArray): IsEndParseSuccessful {
                    return c.length > 0 ? "success": "fail"
                },
                sub: {
                    EnumMember: {
                        kind: "leaf",
                        regex: /^\s*(?<name>[a-zA-Z_]\w*)(,|\s)/,
                        parse(c: RegExpExecArray): WithoutLocation<EnumMember> | undefined {
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
                parse(c: RegExpExecArray): WithoutLocation<Import> | undefined {
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
        const f: WithoutLocation<File> = extractToCompositeEntity(cursor, completeParse)
        return Object.assign(f, {
            loc: cursor.filelocation
        })
    }

    type ChildOf<K extends WithChildren, CHILD_TYPE extends AnyEntity> = Extract<CHILD_TYPE, {kind: keyof K["children"]}>

    type W = ChildOf<File, WithChildren>


    function extractToCompositeEntity<K extends WithChildren>(cursor: FileCursor, parser: CompositeParserNode<K>): K extends File ? WithoutLocation<File> : K | undefined {
        const m = cursor.tryMatch(parser.startRegex)
        if (!m.hit) {
            return undefined
        }
        const withoutLoc = parser.parseStart(m.match)
        // @ts-ignore
        const k: K extends File ? WithoutLocation<File> : K = withoutLoc.kind === EntityKind.File ? withoutLoc : Object.assign(withoutLoc, {loc: m.loc})
        
        let tryExtractChild = true 
        while (tryExtractChild) {
            tryExtractChild = false
            for (const key in parser.sub) {
                //@ts-ignore
                const c: CompositeParserNode<ChildOf<K, WithChildren>> | LeafParserNode<ChildOf<K, Exclude<AnyEntity, WithChildren>>> = parser.sub[key]
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
                    default: assertNever(c)
                }
                if (tryExtractChild) {
                    break
                }
            }
        }
        const end = cursor.tryMatch(parser.endRegex)
        if (end.hit) {
            return k
        }

        throw new Error(`Unable to parse end for entity: ${JSON.stringify(k, null, 2)} \n\n ${JSON.stringify(cursor)}\n${cursor.getPositionHint()}`)
    }



    type AnyEntity = File | Message | Import | Field | Enum | EnumMember
    type WithChildren = Extract<AnyEntity, {children: any}>

    type IsEndParseSuccessful = "success" | "fail"
    type ParserTree<ROOT extends WithChildren> ={
        [CHILD in keyof ROOT["children"]]: ParserTreeNode<Extract<AnyEntity, {kind: CHILD}>>
    };

    type CompositeParserNode<ROOT extends WithChildren> = {
        startRegex: RegExp
        parseStart(c: RegExpExecArray): WithoutLocation<ROOT> | undefined
        parseEnd(c: RegExpExecArray): IsEndParseSuccessful
        endRegex: RegExp
        sub: ParserTree<ROOT>,
    } & ParserNode<"composite">

    type ParserNode<KIND> = {kind: KIND}
    type LeafParserNode<ROOT extends AnyEntity> =  ParserNode<"leaf"> & { 
        regex: RegExp
        parse(c: RegExpExecArray): WithoutLocation<ROOT> | undefined
    }
    type ParserTreeNode<ROOT extends AnyEntity> = ROOT extends WithChildren ? CompositeParserNode<ROOT> : LeafParserNode<ROOT>
    type WithoutLocation<K extends AnyEntity> = Omit<K, "loc">
}
