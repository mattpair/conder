import { Symbol, Primitives, TypeModifiers, TypeModifierUnion, TypeModifierPrefixSynonym } from './lexicon';
import { assertNever } from './utils';
import { FileLocation } from "./utils";
import * as e from './entity/basic'


export namespace Parse {
    
    export type File = 
    e.Entity<"File"> & 
    e.ParentOfMany<Struct> &  
    e.ParentOfMany<e.Enum> & 
    e.ParentOfMany<Function> &
    e.ParentOfMany<StoreDefinition> &
    {readonly loc: FileLocation}

    export type TypeName = e.NamedIntrafile<"TypeName", {}>
    export type DetailedType = e.IntrafileEntity<"DetailedType", e.RequiresOne<CompleteType> & {modification: TypeModifierUnion}>
    export type CompleteType = e.PolymorphicEntity<"CompleteType", () => TypeName | DetailedType | e.PrimitiveEntity >
    
    export type Field = e.NamedIntrafile<"Field",  e.RequiresOne<CompleteType>>

    export type VariableReference = e.IntrafileEntity<"VariableReference", {val: string} & e.ParentOfMany<DotStatement>>
    export type FieldLiteral = e.NamedIntrafile<"FieldLiteral", e.RequiresOne<Assignable>>
    export type ObjectLiteral = e.IntrafileEntity<"ObjectLiteral", e.ParentOfMany<FieldLiteral>>
    export type NumberLiteral = e.IntrafileEntity<"NumberLiteral", {val: number}>
    export type StringLiteral = e.IntrafileEntity<"StringLiteral", {val: string}>
    export type MethodInvocation = e.NamedIntrafile<"MethodInvocation", e.ParentOfMany<Assignable>>
    export type Nothing = e.IntrafileEntity<"Nothing", {}>
    export type Returnable = e.PolymorphicEntity<"Returnable", () => Nothing | Assignable>
    export type ReturnStatement = e.IntrafileEntity<"ReturnStatement", e.RequiresOne<Returnable>>
    export type ArrayLiteral = e.IntrafileEntity<"ArrayLiteral", e.ParentOfMany<Assignable>>
    export type Assignable = e.PolymorphicEntity<"Assignable", () => VariableReference | AnonFunction | ArrayLiteral | ObjectLiteral | NumberLiteral | StringLiteral>
    export type DotStatement = e.PolymorphicEntity<"DotStatement", () => FieldAccess | MethodInvocation>
    export type VariableCreation = e.NamedIntrafile<"VariableCreation", e.RequiresOne<CompleteType> & e.RequiresOne<Assignable>>
    export type Statement = e.BaseStatement<() => ReturnStatement | VariableReference | VariableCreation | ForIn | If>
    export type Statements = e.IntrafileEntity<"Statements", e.ParentOfMany<Statement>>
    export type FieldAccess = e.NamedIntrafile<"FieldAccess", {}>
    export type FunctionBody = e.BaseFunctionBody<Statement>
    export type UnaryParameterType = e.IntrafileEntity<"UnaryParameterType", e.RequiresOne<CompleteType>>
    export type NoParameter = e.IntrafileEntity<"NoParameter", {}>
    export type UnaryParameter = e.BaseUnaryParameter<UnaryParameterType>
    export type Parameter = e.PolymorphicEntity<"Parameter", () => UnaryParameter| NoParameter> 
    export type ReturnTypeSpec = e.BaseReturnTypeSpec<() => e.VoidReturn | CompleteType >
    export type Function = e.BaseFunction<FunctionBody, ReturnTypeSpec, Parameter>
    export type Struct = e.BaseStruct<Field>
    export type WithinForIn = e.PolymorphicEntity<"WithinForIn", () => VariableReference>
    export type ForInBody = e.IntrafileEntity<"ForInBody", e.ParentOfMany<WithinForIn>>
    export type ForIn = e.IntrafileEntity<"ForIn", {rowVarName: string} & e.RequiresOne<ForInBody> & e.RequiresOne<Assignable>>
    export type If = e.IntrafileEntity<"If", e.RequiresOne<Assignable> & e.RequiresOne<Statements>>
    export type AnonFunction = e.IntrafileEntity<"AnonFunction", e.RequiresOne<Statements> & {rowVarName: string}>

    export type StoreDefinition = e.NamedIntrafile<"StoreDefinition", e.RequiresOne<CompleteType> & e.RequiresOne<ArrayLiteral>>

    const symbolRegex: RegExp = new RegExp(`^(${Object.values(Symbol).join("|")})$`)

    type MatchResult = {hit: true, match: RegExpExecArray, loc: e.EntityLocation} | {hit: false}
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
                    throw new Error(`Entities may not be named after reserved symbols: Line: ${startLineNumber}\n\n${match.groups.name}`)

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
        const children = extractChildren<"File">(cursor, completeParserV2, {Enum: true, Struct: true, Function: true, StoreDefinition: true}, {})
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
    
    function extractChildren<K extends WithChildren["kind"]>(cursor: FileCursor, parserSet: CompleteParserV2, accepts: ChildrenDescription<EntityOf<K>>, options: AggregationOptions): EntityOf<K>["children"] {
        let tryExtractChild = true
        let foundAny = false
        let tryFindAnother = true
        const children: any = {}
        for (const k in accepts) {
            children[k] = []
        }
    
        while (tryExtractChild && tryFindAnother) {
            tryExtractChild = false
            if (foundAny && options && options.inBetweenAll) {
                const sep = cursor.tryMatch(options.inBetweenAll)                
                if (!sep.hit) {
                    tryFindAnother = false
                }
            }
            for (const key in accepts) {
                
                const child = tryExtractEntity(cursor, 
                    key as keyof CompleteParserV2, 
                    parserSet)
                if (child !== undefined) {
                    tryExtractChild = true
                    foundAny = true
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
        
        const children = extractChildren(cursor, parserSet, parser.hasMany, parser.options)
        const end = cursor.tryMatch(parser.endRegex)
        if (end.hit) {
            return parser.assemble(m.match, end.match, m.loc, children)
        }

        throw new Error(`Unable to parse end for entity of type: ${parser.endRegex.source}\n${cursor.getPositionHint()}`)
    }

    type AnyEntity = 
        File | 
        Struct | 
        Field | 
        e.Enum | 
        e.EnumMember | 
        Function |
        FunctionBody |
        ReturnTypeSpec |
        Parameter | 
        e.VoidReturn |
        ReturnStatement | 
        Statement |
        UnaryParameterType |
        NoParameter |
        UnaryParameter | 
        StoreDefinition |
        VariableReference |
        Returnable |
        Nothing |
        Assignable |
        VariableCreation |
        FieldAccess |
        MethodInvocation |
        DotStatement |
        WithinForIn |
        ForIn |
        ForInBody |
        If |
        Statements |
        AnonFunction |
        CompleteType |
        DetailedType |
        TypeName |
        e.PrimitiveEntity |
        ArrayLiteral |
        FieldLiteral |
        ObjectLiteral |
        NumberLiteral | 
        StringLiteral

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
                let start: MatchResult = undefined
                let matchKey: string = undefined
                if (isSingleRegex(parser.startRegex)) {
                    start = cursor.tryMatch(parser.startRegex) 
                } else {
                    for (const key in parser.startRegex) {
                        start = cursor.tryMatch(parser.startRegex[key])
                        if (start.hit) {
                            matchKey = key
                            break
                        }
                    }
                }
                                    
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
                        //@ts-ignore
                        throw new Error(`Unable to parse required ${req} entity at ${JSON.stringify(start.loc)}\n\n ${cursor.getPositionHint()}`)
                    }
                    if (childdef.afterRegex !== undefined) {
                        if (!cursor.tryMatch(childdef.afterRegex).hit) {
                            throw new Error(`Unable to parse suffix of ${req} for ${kind}`)
                        }
                    }
                    part[req] = depMatch
                })

                let end: MatchResult = undefined
                if (isSingleRegex(parser.endRegex)) {
                    end = cursor.tryMatch(parser.endRegex)
                } else {
                    if (matchKey !== undefined) {
                        end = cursor.tryMatch(parser.endRegex[matchKey])
                    } else {
                        for (const key in parser.endRegex.regexes) {
                            end = cursor.tryMatch(parser.endRegex[key])
                            if (end.hit) {
                                break
                            }
                        }
                    }
                }

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

    type AggregationOptions = {inBetweenAll?: RegExp}
    type AggregationParserV2<K extends WithChildren> = Readonly<{
        kind: "aggregate"
        startRegex: RegExp
        assemble(start: RegExpExecArray, end: RegExpExecArray, loc: e.EntityLocation, children: K["children"]): K | undefined
        endRegex: RegExp
        hasMany: ChildrenDescription<K>,
        options: AggregationOptions
    }>

    type LeafParserV2<K extends AnyEntity> = Readonly<{
        kind: "leaf"
        regex: RegExp
        assemble(c: RegExpExecArray, loc: e.EntityLocation): K | undefined
    }>

    type ConglomerateChildParseDefinition = Readonly<{
        beforeRegex?: RegExp
        afterRegex?: RegExp
        order: number
    }>
    type RegexDef = RegExp | Record<string, RegExp>
    function isSingleRegex(t: RegexDef): t is RegExp {
        return typeof t.compile === "function"
    }

    type ConglomerateParserV2<K extends WithDependentClause> = Readonly<{
        kind: "conglomerate"
        startRegex: RegexDef
        assemble(start: RegExpExecArray, end: RegExpExecArray, loc: e.EntityLocation, part: K["part"]): K | undefined
        endRegex: RegexDef
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

    type ToFullEntity<K extends e.EntityKinds> = Extract<AnyEntity, {kind: K}>
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
            assemble(start, end, loc, children): e.Enum | undefined {
                return {
                    kind: "Enum",
                    name: start.groups.name,
                    loc,
                    children
                }
            },
            endRegex:/^\s*}/,
            hasMany: {EnumMember: true},
            options: {}
        },
        
        EnumMember: {
            kind: "leaf",
            regex: /^\s*(?<name>[a-zA-Z_]\w*)(,|\s)/,
            assemble(c, loc): e.EnumMember | undefined {

                return{
                    kind: "EnumMember",
                    name: c.groups.name,
                    loc
                }   
            }
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
                CompleteType: {order: 1}
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
            hasMany: {Field: true},
            options: {}
        },
        Function: {
            kind: "conglomerate",
            startRegex: /^\s*(?<exposure>public|private)? +function +(?<name>[a-zA-Z_]\w*)/,
            endRegex: /^/,
            assemble(start, end, loc, part): Function | undefined {
                if (start.groups.exposure === undefined) {
                    throw Error(`Function ${start.groups.name} must be either public or private`)
                } else if (start.groups.exposure === "private") {
                    throw Error(`Private functions currently aren't supported`)
                }

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
            priority: {CompleteType: 2, VoidReturnType: 3}
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
            hasMany: {Statement: true},
            options: {}
        },
        UnaryParameterType: {
            kind: "conglomerate",
            requiresOne: {CompleteType: {order: 2}},
            startRegex: /^/,
            endRegex: /^/,
            assemble: (s,e,loc,part) => ({kind: "UnaryParameterType", part, loc})
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
            priority: {ReturnStatement: 1, ForIn: 2,  VariableReference: 20, VariableCreation: 19, If: 3}
        },
        Statements: {
            kind: "aggregate",
            startRegex: /^/,
            endRegex: /^/,
            assemble(start, end, loc, children) {
                return {
                    kind: "Statements",
                    children
                }
            },
            hasMany: {
                Statement: true
            },
            options: {}
        },
        If: {
            kind: "conglomerate",
            startRegex: /^\s*if +/,
            endRegex: /^/,
            requiresOne: {
                Assignable: {
                    order: 1,
                    afterRegex: /^\s*{/
                },
                Statements: {
                    order: 2,
                    afterRegex: /^\s*}/
                }
            },
            assemble(start, end, loc, part) {
                return {
                    kind: "If",
                    loc,
                    part
                }
            }
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
            endRegex: /^/,
            requiresOne: {
                CompleteType: {order: 1},
                ArrayLiteral: {order: 2, beforeRegex: /^\s*=\s*/}
            },
            assemble(start, end, loc, part) {
                if (part.ArrayLiteral.children.Assignable.length > 0) {
                    throw Error(`Global arrays must be initialized empty`)
                }
                return {
                    kind: "StoreDefinition",
                    loc: loc,
                    name: start.groups.name,
                    part
                }
            }
        },
        VariableReference: {
            kind: "aggregate",
            startRegex: /^\s*(?<name>[a-zA-Z_]\w*)/,
            endRegex: /^\s*/,
            assemble(start, end, loc, children) {
                return {
                    kind: "VariableReference",
                    loc,
                    val: start.groups.name,
                    children
                }
            },
            hasMany: {
                DotStatement: true
            },
            options: {}
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
                CompleteType: {
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
                ArrayLiteral: 3,
                NumberLiteral: 5,
                ObjectLiteral: 4,
                VariableReference: 2,
                AnonFunction: 1,
                StringLiteral: 6
            },
            groupKind: "Assignable"
        },
        FieldAccess: {
            kind: "leaf",
            regex: /^\.(?<name>[a-zA-Z_]\w*)/,
            assemble: (c, loc) => {
                return {
                    name: c.groups.name,
                    kind: "FieldAccess",
                    loc
                }
            }
        },
        MethodInvocation: {
            kind: "aggregate",
            startRegex: /^\.(?<name>[a-zA-Z_]\w*)\(/,
            endRegex: /^\s*\)/,
            hasMany: {
                Assignable: true
            },
            options: {
                inBetweenAll: /^((\s*,\s*)|(?=\s*\)))/,
            },
            assemble(start, end, loc, children) {
                return {
                    kind: "MethodInvocation",
                    loc,
                    name: start.groups.name,
                    children
                }
            }
        },
        DotStatement: {
            kind: "polymorph",
            priority: {
                MethodInvocation: 1,
                FieldAccess: 2
            },
            groupKind: "DotStatement"
        },
        ForIn: {
            kind: "conglomerate",
            startRegex: /^\s+for +(?<name>[a-zA-Z_]\w*) +in +/,
            endRegex: /^/,
            requiresOne: {
                Assignable: {order: 1},
                ForInBody: {order: 2}
            },

            assemble(start, end, loc, part) {
                return {
                    kind: "ForIn",
                    rowVarName: start.groups.name,
                    loc,
                    part
                }
            }
        },
        ForInBody: {
            kind: "aggregate",
            startRegex: /^\s*{\s*/,
            endRegex: /^\s*}/,
            options: {},
            hasMany: {
                WithinForIn: true
            },
            assemble(start, end, loc, children) {
                return {
                    kind: "ForInBody",
                    loc,
                    children
                }
            }
        },
        WithinForIn: {
            kind: "polymorph",
            groupKind: "WithinForIn",
            priority: {
                VariableReference: 1
            }
        },
        AnonFunction: {
            kind: "conglomerate",
            startRegex: /^\s*(?<name>[a-zA-Z_]\w*) +=> +{/,
            endRegex: /^\s*}/,
            requiresOne: {
                Statements: {order: 1}
            },
            assemble(start, end, loc, part) {
                return {
                    kind: "AnonFunction",
                    part,
                    loc,
                    rowVarName: start.groups.name
                }
            }
        },
        CompleteType: {
            kind: "polymorph",
            priority: {
                Primitive: 1,
                DetailedType: 0,
                TypeName: 2
            },
            groupKind: "CompleteType"
        },
        Primitive: {
            kind: "leaf",
            regex: new RegExp(`^\\s*(?<val>(${Primitives.join("|")}))(?!\\w)`),
            assemble(c, loc) {
                return {
                    kind: "Primitive",
                    type: c.groups.val as any
                }
            }
        },
        DetailedType: {
            kind: "conglomerate",
            startRegex: {
                generic: new RegExp(`^\\s*(?<val>${TypeModifiers.join("|")})\\s*<\\s*`),
                prefix: new RegExp(`^\\s*(?<syn>${Object.keys(TypeModifierPrefixSynonym).join("|")})\\s*`)
            },
            endRegex: {
                generic: /^\s*>/,
                prefix: /^/
            },
            requiresOne: {
                CompleteType: {order: 1}
            },
            assemble: (start, end, loc, part) => {
                let modification: TypeModifierUnion = Symbol.none
                if (start.groups.val !== undefined) {
                    //@ts-ignore
                    modification = start.groups.val
                } else {
                    modification = TypeModifierPrefixSynonym[start.groups.syn]
                    if (modification === undefined) {
                        throw Error(`Unrecognized symbol ${start.groups.syn}`)
                    }
                }

                return {
                    kind: "DetailedType",
                    loc,
                    part,
                    modification
                }
            }
        },
        TypeName: {
            kind: "leaf",
            regex: /^\s*(?<name>[a-zA-Z_]\w*)/,
            assemble: (r, loc) => ({kind: "TypeName", name: r.groups.name, loc})
        },
        ArrayLiteral: {
            kind: "aggregate",
            startRegex: /^\s*\[/,
            endRegex: /^\s*\]/,
            assemble(start, end, loc, children) {
                return {
                    kind: 'ArrayLiteral',
                    children,
                    loc
                }
            },
            hasMany: {
                Assignable: true
            },
            options: {
                inBetweenAll: /^(\n|,)\s*/
            }
        },
        FieldLiteral: {
            kind: "conglomerate",
            startRegex: /^\s*(?<name>[a-zA-Z]\w*):/,
            endRegex: /^/,
            requiresOne: {
                Assignable: {
                    order: 1
                }
            },
            assemble(start, end, loc, part) {
                return {
                    kind: "FieldLiteral",
                    loc,
                    name: start.groups.name,
                    part
                }
            }
        },
        ObjectLiteral: {
            kind: "aggregate",
            startRegex: /^\s*{/,
            endRegex: /^(\s*|,)\s*}/,
            hasMany: {
                FieldLiteral: true
            },
            options: {
                inBetweenAll: /^(\n|,)/
            },
            assemble(start, end, loc, children) {
                return {
                    kind: "ObjectLiteral",
                    loc,
                    children
                }
            }
        },
        NumberLiteral: {
            kind: "leaf",
            regex: /^(?<val>\d+(\.\d+)?)/,
            assemble: (c, loc) => ({kind: "NumberLiteral", val: Number(c.groups.val), loc})
        },
        StringLiteral: {
            kind: "leaf",
            regex: /^\s*`(?<val>[\S\s]*(?<!\\))`/,
            assemble:(c, loc) => ({kind: "StringLiteral", loc, val: c.groups.val.replace("\`", "`")})
        }
    }
}