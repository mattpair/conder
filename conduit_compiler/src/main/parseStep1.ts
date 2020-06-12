import { Primitives, PrimitiveUnion, Symbol } from './lexicon';
import { Classified, assertNever } from './util/classifying';
import { FileLocation } from "./util/filesystem";
import {BaseConduitFile, Enum, EntityLocation, BaseField, BaseMsg, BaseImport, EnumMember, EntityKind} from './entity/basic'


export namespace Parse {
    export type File = BaseConduitFile<Message, Enum, Import>
    type MatchResult = {hit: true, match: RegExpExecArray, loc: EntityLocation} | {hit: false}    
    
    export type FieldType = Classified<"primitive", PrimitiveUnion> | Classified<"deferred", {from?: string, type: string}>
    export type Field = BaseField<FieldType>

    export type Message = BaseMsg<Field>
    export type Import = BaseImport<{
        readonly fromPresentDir: boolean
        readonly filename: string
    }>
    


    type AnyEntity = File | Message | Import | Field | Enum | EnumMember
    type WithChildren = Extract<AnyEntity, {children: any}>

    type IsEndParseSuccessful = "success" | "fail"
    type ParserTree<ROOT extends WithChildren> ={
        [CHILD in keyof ROOT["children"]]: ParserTreeNode<Extract<AnyEntity, {kind: CHILD}>>
    };

    type CompositeParserNode<ROOT extends WithChildren> = {
        parseStart(c: FileCursor): ROOT | undefined
        parseEnd(c: FileCursor): IsEndParseSuccessful
        sub: ParserTree<ROOT>,
    } & ParserNode<"composite">

    type ParserNode<KIND> = {kind: KIND}
    type LeafParserNode<ROOT extends AnyEntity> =  ParserNode<"leaf"> & { parse(c: FileCursor): ROOT | undefined}
    type ParserTreeNode<ROOT extends AnyEntity> = ROOT extends WithChildren ? CompositeParserNode<ROOT> : LeafParserNode<ROOT>

    type CompleteParser = ParserTreeNode<File>
    const completeParse: CompleteParser = {
        kind: "composite",
        parseStart(c: FileCursor): File | undefined {
            return {kind: EntityKind.File, loc: c.filelocation, children: {Enum: [], Message: [], Import: []}}
        },
        parseEnd(c): IsEndParseSuccessful {
            return c.tryMatch(/^\s*/).hit && c.isDone() ? "success" : "fail"
        },
        sub: {
            Message: {
                kind: "composite",
                parseStart(c: FileCursor): Message | undefined {
                    const result = c.tryMatch(/^\s*message +(?<name>[a-zA-Z_]\w*) *{/)
                    if(result.hit) {
                        return {
                            kind: EntityKind.Message,
                            loc: result.loc,
                            name: result.match.groups.name,
                            children: {
                                Field: []
                            }
                        }
                    }
                },
                
                parseEnd(c: FileCursor): IsEndParseSuccessful {
                    return c.tryMatch(/^\s*}/).hit ? "success" : "fail"
                    
                },
                sub: {
                    Field: {
                        kind: "leaf",
                        parse(c: FileCursor): Field | undefined {
                            const result = c.tryMatch(/^\s*(?<optional>optional)? +((?<from>[_A-Za-z]+[\w]*)\.)?(?<type>[_A-Za-z]+[\w]*) +(?<name>[_A-Za-z]+[\w]*)(,|\n)/)
                            if (result.hit) {

                                const prim = Primitives.find(p => p === result.match.groups.type)
                                return {
                                    kind: EntityKind.Field,
                                    loc: result.loc,
                                    name: result.match.groups.name,
                                    isRequired: result.match.groups.optional === undefined,
                                    fType: prim !== undefined ? {kind: "primitive", val: prim} : {kind: "deferred", val: {
                                        from: result.match.groups.from,
                                        type: result.match.groups.type
                                    }}
                                }
                            }
                        }
                    }
                }
            },
            Enum: {
                kind: "composite",
                parseStart(c: FileCursor): Enum | undefined {
                    const result = c.tryMatch(/^\s*enum +(?<name>[a-zA-Z_]\w*) *{/)
                    if (result.hit) {
                        return {
                            kind: EntityKind.Enum,
                            loc: result.loc,
                            name: result.match.groups.name,
                            children: {
                                EnumMember: []
                            }
                        }
                    }
                },
                parseEnd(c: FileCursor): IsEndParseSuccessful {
                    return c.tryMatch(/^\s*}/).hit ? "success": "fail"
                },
                sub: {
                    EnumMember: {
                        kind: "leaf",
                        parse(c: FileCursor): EnumMember | undefined {
                            const result = c.tryMatch(/^\s*(?<name>[a-zA-Z_]\w*)(,|\s)/)
                            if (result.hit) {
                                return{
                                    kind: EntityKind.EnumMember,
                                    loc: result.loc,
                                    name: result.match.groups.name
                                }
                            }   
                        }
                    }
                }
            },
            Import: {
                kind: "leaf",
                parse(c: FileCursor): Import | undefined {
                    const res = c.tryMatch(/^\s*import +'(?<presentDir>\.\/)?(?<location>[\w \.\/]*)' +as +(?<name>[_A-Za-z]+[\w]*)/)
                    if(res.hit) {
                        return {
                            kind: EntityKind.Import,
                            loc: res.loc,
                            fromPresentDir: res.match.groups.presentDir !== undefined,
                            name: res.match.groups.name,
                            filename: res.match.groups.location
                        }
                    }
                }
            }
        }
    }

    const symbolRegex: RegExp = new RegExp(`^(${Object.values(Symbol).join("|")})`)
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
        return extractToCompositeEntity(cursor, completeParse)
    }

    type ChildOf<K extends WithChildren, CHILD_TYPE extends AnyEntity> = Extract<CHILD_TYPE, {kind: keyof K["children"]}>

    type W = ChildOf<File, WithChildren>

    function extractToCompositeEntity<K extends WithChildren>(cursor: FileCursor, parser: CompositeParserNode<K>): K | undefined {
        const k: K = parser.parseStart(cursor)
        if (k === undefined) {
            return undefined
        }
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
                        const leaf = c.parse(cursor)
                        if (leaf !== undefined) {
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

        if (parser.parseEnd(cursor) === "success") {
            return k
        }

        throw new Error(`Unable to parse end for entity: ${JSON.stringify(k, null, 2)} \n\n ${JSON.stringify(cursor)}\n${cursor.getPositionHint()}`)
    }

}
