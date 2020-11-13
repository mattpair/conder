/* AutoGenerated Code, changes may be overwritten
* INPUT GRAMMAR:
* globals := {value={constant | func} {ws+ | '$'}}*
* constant := ws* 'const' ws+ name=name ws* equals ws* value=literal
* name := name='[a-zA-Z]+\w*'
* equals := '='
* ws := '\s'
* obj := '\{' ws* fields=fields ws* '\}'
* literal := obj
* newLineOrComma := '\n' | ','
* field := name=name ws* ':' value=literal newLineOrComma?
* fields := value=field*
* space := ' '
* func := ws* 'public' space+ 'function' space+ name=name space* '\(\)' ws* '\{' ws* '\}'
*/
type Nullable<T> = T | null;
type $$RuleType<T> = (log?: (msg: string) => void) => Nullable<T>;
export interface ContextRecorder {
    record(pos: PosInfo, depth: number, result: any, negating: boolean, extraInfo: string[]): void;
}
interface ASTNodeIntf {
    kind: ASTKinds;
}
export enum ASTKinds {
    globals = "globals",
    globals_$0 = "globals_$0",
    globals_$0_$0_1 = "globals_$0_$0_1",
    globals_$0_$0_2 = "globals_$0_$0_2",
    globals_$0_$1_1 = "globals_$0_$1_1",
    globals_$0_$1_2 = "globals_$0_$1_2",
    constant = "constant",
    name = "name",
    equals = "equals",
    ws = "ws",
    obj = "obj",
    literal = "literal",
    newLineOrComma_1 = "newLineOrComma_1",
    newLineOrComma_2 = "newLineOrComma_2",
    field = "field",
    fields = "fields",
    space = "space",
    func = "func",
}
export type globals = globals_$0[];
export interface globals_$0 {
    kind: ASTKinds.globals_$0;
    value: globals_$0_$0;
}
export type globals_$0_$0 = globals_$0_$0_1 | globals_$0_$0_2;
export type globals_$0_$0_1 = constant;
export type globals_$0_$0_2 = func;
export type globals_$0_$1 = globals_$0_$1_1 | globals_$0_$1_2;
export type globals_$0_$1_1 = ws[];
export type globals_$0_$1_2 = string;
export interface constant {
    kind: ASTKinds.constant;
    name: name;
    value: literal;
}
export interface name {
    kind: ASTKinds.name;
    name: string;
}
export type equals = string;
export type ws = string;
export interface obj {
    kind: ASTKinds.obj;
    fields: fields;
}
export type literal = obj;
export type newLineOrComma = newLineOrComma_1 | newLineOrComma_2;
export type newLineOrComma_1 = string;
export type newLineOrComma_2 = string;
export interface field {
    kind: ASTKinds.field;
    name: name;
    value: literal;
}
export interface fields {
    kind: ASTKinds.fields;
    value: field[];
}
export type space = string;
export interface func {
    kind: ASTKinds.func;
    name: name;
}
export class Parser {
    private readonly input: string;
    private pos: PosInfo;
    private negating: boolean = false;
    constructor(input: string) {
        this.pos = {overallPos: 0, line: 1, offset: 0};
        this.input = input;
    }
    public reset(pos: PosInfo) {
        this.pos = pos;
    }
    public finished(): boolean {
        return this.pos.overallPos === this.input.length;
    }
    public matchglobals($$dpth: number, $$cr?: ContextRecorder): Nullable<globals> {
        return this.loop<globals_$0>(() => this.matchglobals_$0($$dpth + 1, $$cr), true);
    }
    public matchglobals_$0($$dpth: number, $$cr?: ContextRecorder): Nullable<globals_$0> {
        return this.runner<globals_$0>($$dpth,
            (log) => {
                if (log) {
                    log("globals_$0");
                }
                let $scope$value: Nullable<globals_$0_$0>;
                let $$res: Nullable<globals_$0> = null;
                if (true
                    && ($scope$value = this.matchglobals_$0_$0($$dpth + 1, $$cr)) !== null
                    && this.matchglobals_$0_$1($$dpth + 1, $$cr) !== null
                ) {
                    $$res = {kind: ASTKinds.globals_$0, value: $scope$value};
                }
                return $$res;
            }, $$cr)();
    }
    public matchglobals_$0_$0($$dpth: number, $$cr?: ContextRecorder): Nullable<globals_$0_$0> {
        return this.choice<globals_$0_$0>([
            () => this.matchglobals_$0_$0_1($$dpth + 1, $$cr),
            () => this.matchglobals_$0_$0_2($$dpth + 1, $$cr),
        ]);
    }
    public matchglobals_$0_$0_1($$dpth: number, $$cr?: ContextRecorder): Nullable<globals_$0_$0_1> {
        return this.matchconstant($$dpth + 1, $$cr);
    }
    public matchglobals_$0_$0_2($$dpth: number, $$cr?: ContextRecorder): Nullable<globals_$0_$0_2> {
        return this.matchfunc($$dpth + 1, $$cr);
    }
    public matchglobals_$0_$1($$dpth: number, $$cr?: ContextRecorder): Nullable<globals_$0_$1> {
        return this.choice<globals_$0_$1>([
            () => this.matchglobals_$0_$1_1($$dpth + 1, $$cr),
            () => this.matchglobals_$0_$1_2($$dpth + 1, $$cr),
        ]);
    }
    public matchglobals_$0_$1_1($$dpth: number, $$cr?: ContextRecorder): Nullable<globals_$0_$1_1> {
        return this.loop<ws>(() => this.matchws($$dpth + 1, $$cr), false);
    }
    public matchglobals_$0_$1_2($$dpth: number, $$cr?: ContextRecorder): Nullable<globals_$0_$1_2> {
        return this.regexAccept(String.raw`(?:$)`, $$dpth + 1, $$cr);
    }
    public matchconstant($$dpth: number, $$cr?: ContextRecorder): Nullable<constant> {
        return this.runner<constant>($$dpth,
            (log) => {
                if (log) {
                    log("constant");
                }
                let $scope$name: Nullable<name>;
                let $scope$value: Nullable<literal>;
                let $$res: Nullable<constant> = null;
                if (true
                    && this.loop<ws>(() => this.matchws($$dpth + 1, $$cr), true) !== null
                    && this.regexAccept(String.raw`(?:const)`, $$dpth + 1, $$cr) !== null
                    && this.loop<ws>(() => this.matchws($$dpth + 1, $$cr), false) !== null
                    && ($scope$name = this.matchname($$dpth + 1, $$cr)) !== null
                    && this.loop<ws>(() => this.matchws($$dpth + 1, $$cr), true) !== null
                    && this.matchequals($$dpth + 1, $$cr) !== null
                    && this.loop<ws>(() => this.matchws($$dpth + 1, $$cr), true) !== null
                    && ($scope$value = this.matchliteral($$dpth + 1, $$cr)) !== null
                ) {
                    $$res = {kind: ASTKinds.constant, name: $scope$name, value: $scope$value};
                }
                return $$res;
            }, $$cr)();
    }
    public matchname($$dpth: number, $$cr?: ContextRecorder): Nullable<name> {
        return this.runner<name>($$dpth,
            (log) => {
                if (log) {
                    log("name");
                }
                let $scope$name: Nullable<string>;
                let $$res: Nullable<name> = null;
                if (true
                    && ($scope$name = this.regexAccept(String.raw`(?:[a-zA-Z]+\w*)`, $$dpth + 1, $$cr)) !== null
                ) {
                    $$res = {kind: ASTKinds.name, name: $scope$name};
                }
                return $$res;
            }, $$cr)();
    }
    public matchequals($$dpth: number, $$cr?: ContextRecorder): Nullable<equals> {
        return this.regexAccept(String.raw`(?:=)`, $$dpth + 1, $$cr);
    }
    public matchws($$dpth: number, $$cr?: ContextRecorder): Nullable<ws> {
        return this.regexAccept(String.raw`(?:\s)`, $$dpth + 1, $$cr);
    }
    public matchobj($$dpth: number, $$cr?: ContextRecorder): Nullable<obj> {
        return this.runner<obj>($$dpth,
            (log) => {
                if (log) {
                    log("obj");
                }
                let $scope$fields: Nullable<fields>;
                let $$res: Nullable<obj> = null;
                if (true
                    && this.regexAccept(String.raw`(?:\{)`, $$dpth + 1, $$cr) !== null
                    && this.loop<ws>(() => this.matchws($$dpth + 1, $$cr), true) !== null
                    && ($scope$fields = this.matchfields($$dpth + 1, $$cr)) !== null
                    && this.loop<ws>(() => this.matchws($$dpth + 1, $$cr), true) !== null
                    && this.regexAccept(String.raw`(?:\})`, $$dpth + 1, $$cr) !== null
                ) {
                    $$res = {kind: ASTKinds.obj, fields: $scope$fields};
                }
                return $$res;
            }, $$cr)();
    }
    public matchliteral($$dpth: number, $$cr?: ContextRecorder): Nullable<literal> {
        return this.matchobj($$dpth + 1, $$cr);
    }
    public matchnewLineOrComma($$dpth: number, $$cr?: ContextRecorder): Nullable<newLineOrComma> {
        return this.choice<newLineOrComma>([
            () => this.matchnewLineOrComma_1($$dpth + 1, $$cr),
            () => this.matchnewLineOrComma_2($$dpth + 1, $$cr),
        ]);
    }
    public matchnewLineOrComma_1($$dpth: number, $$cr?: ContextRecorder): Nullable<newLineOrComma_1> {
        return this.regexAccept(String.raw`(?:\n)`, $$dpth + 1, $$cr);
    }
    public matchnewLineOrComma_2($$dpth: number, $$cr?: ContextRecorder): Nullable<newLineOrComma_2> {
        return this.regexAccept(String.raw`(?:,)`, $$dpth + 1, $$cr);
    }
    public matchfield($$dpth: number, $$cr?: ContextRecorder): Nullable<field> {
        return this.runner<field>($$dpth,
            (log) => {
                if (log) {
                    log("field");
                }
                let $scope$name: Nullable<name>;
                let $scope$value: Nullable<literal>;
                let $$res: Nullable<field> = null;
                if (true
                    && ($scope$name = this.matchname($$dpth + 1, $$cr)) !== null
                    && this.loop<ws>(() => this.matchws($$dpth + 1, $$cr), true) !== null
                    && this.regexAccept(String.raw`(?::)`, $$dpth + 1, $$cr) !== null
                    && ($scope$value = this.matchliteral($$dpth + 1, $$cr)) !== null
                    && ((this.matchnewLineOrComma($$dpth + 1, $$cr)) || true)
                ) {
                    $$res = {kind: ASTKinds.field, name: $scope$name, value: $scope$value};
                }
                return $$res;
            }, $$cr)();
    }
    public matchfields($$dpth: number, $$cr?: ContextRecorder): Nullable<fields> {
        return this.runner<fields>($$dpth,
            (log) => {
                if (log) {
                    log("fields");
                }
                let $scope$value: Nullable<field[]>;
                let $$res: Nullable<fields> = null;
                if (true
                    && ($scope$value = this.loop<field>(() => this.matchfield($$dpth + 1, $$cr), true)) !== null
                ) {
                    $$res = {kind: ASTKinds.fields, value: $scope$value};
                }
                return $$res;
            }, $$cr)();
    }
    public matchspace($$dpth: number, $$cr?: ContextRecorder): Nullable<space> {
        return this.regexAccept(String.raw`(?: )`, $$dpth + 1, $$cr);
    }
    public matchfunc($$dpth: number, $$cr?: ContextRecorder): Nullable<func> {
        return this.runner<func>($$dpth,
            (log) => {
                if (log) {
                    log("func");
                }
                let $scope$name: Nullable<name>;
                let $$res: Nullable<func> = null;
                if (true
                    && this.loop<ws>(() => this.matchws($$dpth + 1, $$cr), true) !== null
                    && this.regexAccept(String.raw`(?:public)`, $$dpth + 1, $$cr) !== null
                    && this.loop<space>(() => this.matchspace($$dpth + 1, $$cr), false) !== null
                    && this.regexAccept(String.raw`(?:function)`, $$dpth + 1, $$cr) !== null
                    && this.loop<space>(() => this.matchspace($$dpth + 1, $$cr), false) !== null
                    && ($scope$name = this.matchname($$dpth + 1, $$cr)) !== null
                    && this.loop<space>(() => this.matchspace($$dpth + 1, $$cr), true) !== null
                    && this.regexAccept(String.raw`(?:\(\))`, $$dpth + 1, $$cr) !== null
                    && this.loop<ws>(() => this.matchws($$dpth + 1, $$cr), true) !== null
                    && this.regexAccept(String.raw`(?:\{)`, $$dpth + 1, $$cr) !== null
                    && this.loop<ws>(() => this.matchws($$dpth + 1, $$cr), true) !== null
                    && this.regexAccept(String.raw`(?:\})`, $$dpth + 1, $$cr) !== null
                ) {
                    $$res = {kind: ASTKinds.func, name: $scope$name};
                }
                return $$res;
            }, $$cr)();
    }
    public test(): boolean {
        const mrk = this.mark();
        const res = this.matchglobals(0);
        const ans = res !== null && this.finished();
        this.reset(mrk);
        return ans;
    }
    public parse(): ParseResult {
        const mrk = this.mark();
        const res = this.matchglobals(0);
        if (res && this.finished()) {
            return new ParseResult(res, null);
        }
        this.reset(mrk);
        const rec = new ErrorTracker();
        this.matchglobals(0, rec);
        return new ParseResult(res,
            rec.getErr() ?? new SyntaxErr(this.mark(), new Set(["$EOF"]), new Set([])));
    }
    public mark(): PosInfo {
        return this.pos;
    }
    private loop<T>(func: $$RuleType<T>, star: boolean = false): Nullable<T[]> {
        const mrk = this.mark();
        const res: T[] = [];
        for (;;) {
            const t = func();
            if (t === null) {
                break;
            }
            res.push(t);
        }
        if (star || res.length > 0) {
            return res;
        }
        this.reset(mrk);
        return null;
    }
    private runner<T>($$dpth: number, fn: $$RuleType<T>, cr?: ContextRecorder): $$RuleType<T> {
        return () => {
            const mrk = this.mark();
            const res = cr ? (() => {
                const extraInfo: string[] = [];
                const result = fn((msg: string) => extraInfo.push(msg));
                cr.record(mrk, $$dpth, result, this.negating, extraInfo);
                return result;
            })() : fn();
            if (res !== null) {
                return res;
            }
            this.reset(mrk);
            return null;
        };
    }
    private choice<T>(fns: Array<$$RuleType<T>>): Nullable<T> {
        for (const f of fns) {
            const res = f();
            if (res !== null) {
                return res;
            }
        }
        return null;
    }
    private regexAccept(match: string, dpth: number, cr?: ContextRecorder): Nullable<string> {
        return this.runner<string>(dpth,
            (log) => {
                if (log) {
                    if (this.negating) {
                        log("$$!StrMatch");
                    } else {
                        log("$$StrMatch");
                    }
                    // We substring from 3 to len - 1 to strip off the
                    // non-capture group syntax added as a WebKit workaround
                    log(match.substring(3, match.length - 1));
                }
                const reg = new RegExp(match, "y");
                reg.lastIndex = this.mark().overallPos;
                const res = reg.exec(this.input);
                if (res) {
                    let lineJmp = 0;
                    let lind = -1;
                    for (let i = 0; i < res[0].length; ++i) {
                        if (res[0][i] === "\n") {
                            ++lineJmp;
                            lind = i;
                        }
                    }
                    this.pos = {
                        overallPos: reg.lastIndex,
                        line: this.pos.line + lineJmp,
                        offset: lind === -1 ? this.pos.offset + res[0].length : (res[0].length - lind - 1)
                    };
                    return res[0];
                }
                return null;
            }, cr)();
    }
    private noConsume<T>(fn: $$RuleType<T>): Nullable<T> {
        const mrk = this.mark();
        const res = fn();
        this.reset(mrk);
        return res;
    }
    private negate<T>(fn: $$RuleType<T>): Nullable<boolean> {
        const mrk = this.mark();
        const oneg = this.negating;
        this.negating = !oneg;
        const res = fn();
        this.negating = oneg;
        this.reset(mrk);
        return res === null ? true : null;
    }
}
export function parse(s: string): ParseResult {
    const p = new Parser(s);
    return p.parse();
}
export class ParseResult {
    public ast: Nullable<globals>;
    public err: Nullable<SyntaxErr>;
    constructor(ast: Nullable<globals>, err: Nullable<SyntaxErr>) {
        this.ast = ast;
        this.err = err;
    }
}
export interface PosInfo {
    readonly overallPos: number;
    readonly line: number;
    readonly offset: number;
}
export class SyntaxErr {
    public pos: PosInfo;
    public exprules: string[];
    public expmatches: string[];
    constructor(pos: PosInfo, exprules: Set<string>, expmatches: Set<string>) {
        this.pos = pos;
        this.exprules = [...exprules];
        this.expmatches = [...expmatches];
    }
    public toString(): string {
        return `Syntax Error at line ${this.pos.line}:${this.pos.offset}. Tried to match rules ${this.exprules.join(", ")}. Expected one of ${this.expmatches.map((x) => ` '${x}'`)}`;
    }
}
class ErrorTracker implements ContextRecorder {
    private mxpos: PosInfo = {overallPos: -1, line: -1, offset: -1};
    private mnd: number = -1;
    private prules: Set<string> = new Set();
    private pmatches: Set<string> = new Set();
    public record(pos: PosInfo, depth: number, result: any, negating: boolean, extraInfo: string[]) {
        if ((result === null) === negating) {
            return;
        }
        if (pos.overallPos > this.mxpos.overallPos) {
            this.mxpos = pos;
            this.mnd = depth;
            this.pmatches.clear();
            this.prules.clear();
        } else if (pos.overallPos === this.mxpos.overallPos && depth < this.mnd) {
            this.mnd = depth;
            this.prules.clear();
        }
        if (this.mxpos.overallPos === pos.overallPos && extraInfo.length >= 2) {
            if (extraInfo[0] === "$$StrMatch") {
                this.pmatches.add(extraInfo[1]);
            }
            if (extraInfo[0] === "$$!StrMatch") {
                this.pmatches.add(`not ${extraInfo[1]}`);
            }
        }
        if (this.mxpos.overallPos === pos.overallPos && this.mnd === depth) {
            extraInfo.forEach((x) => { if (x !== "$$StrMatch" && x !== "$$!StrMatch") { this.prules.add(x); } });
        }
    }
    public getErr(): SyntaxErr | null {
        if (this.mxpos.overallPos !== -1) {
            return new SyntaxErr(this.mxpos, this.prules, this.pmatches);
        }
        return null;
    }
}