import { DefaultMap } from './../../data_structures/default_map';
import { GraphAnalysis, Subscriptions } from '../../data_structures/visitor';
import { Stack } from '../../data_structures/Stack';
import { Action, ActionSequence, Mutation, ActionKind } from './lock_calculation';
import { MongoNodeSet } from '../globals/mongo';
import { TargetNodeSet, NodeSet, PickTargetNode } from "../IR";

type ActionSummarizer = (n: TargetNodeSet<MongoNodeSet>[]) => ActionSequence

type NodeSummary = {
    may_perform: ActionSequence,
    uses_data_with_taints: Set<string>,
}

type SummarizerState = {
    active: Stack<NodeSummary>,
    taints: DefaultMap<number, Set<string>>,
    globals_tainting_execution: Set<string>,
    may_perform_any_or_all: ActionSequence,
}

// Provides helper methods across state.
class IntuitiveSummarizerState implements SummarizerState {
    active: Stack<NodeSummary>
    taints: DefaultMap<number, Set<string>>
    globals_tainting_execution: Set<string>
    may_perform_any_or_all: ActionSequence

    constructor() {
        this.may_perform_any_or_all = [], 
        this.active = new Stack(() => ({may_perform: [], uses_data_with_taints: new Set(), scope_is_tainted_by: new Set()})), 
        this.taints = new DefaultMap(() => new Set()),
        this.globals_tainting_execution = new Set()
    }

    public endSummaryGroupWith(obj: string, action: ActionKind): void {
        const {may_perform: children_did, uses_data_with_taints} = this.endSummaryGroup()
        const this_action: Action<ActionKind> = action === "get" ?
        {kind: "get", id: obj}
        : new Mutation(obj, [...children_did.map(c => c.id), ...uses_data_with_taints.values(), ...this.globals_tainting_execution.values()])

        this.applyToSummaryGroup(parent => {
            parent.may_perform.push(...children_did, this_action)
            uses_data_with_taints.forEach(parent.uses_data_with_taints.add)
            return parent
        })
        this.may_perform_any_or_all.push(this_action) 
    }

    public startSummaryGroup(): void {
        this.active.push()
    }

    public endSummaryGroup(): NodeSummary {
        return this.active.pop()
    }

    public applyToSummaryGroup(f: Parameters<SummarizerState["active"]["apply_to_last"]>[0]): void {
        this.active.apply_to_last(f)
    }
}

export const MONGO_ACTION_SUMMARIZER: ActionSummarizer = (nodes) => {
    const summary_analysis = new GraphAnalysis(SUMMARIZER_SUBSCRIPTIONS, new IntuitiveSummarizerState())
    summary_analysis.apply(nodes)
    return summary_analysis.state.may_perform_any_or_all
}

const SUMMARIZER_SUBSCRIPTIONS: Subscriptions<IntuitiveSummarizerState, keyof MongoNodeSet> = {
    GetKeyFromObject: {
        before: (n, state) => {
            state.startSummaryGroup()
        },
        after: (n, state) => {
            state.endSummaryGroupWith(n.obj, "get")
        }
    },
    GetWholeObject: {
        before: (n, state) => {

        },
        after: (n, state) => {
            state.may_perform_any_or_all.push({kind: "get", id: n.name})
        }
    },
    keyExists: {
        before: (n, state) => {
            state.startSummaryGroup()
        },
        after: (n, state) => {
            state.endSummaryGroupWith(n.obj, "get")
        }
    },
    DeleteKeyOnObject: {
        before: (n, state) => {
            state.startSummaryGroup()
        },
        after: (n, state) => {
            state.endSummaryGroupWith(n.obj, "mut")
        }
    },
    SetKeyOnObject: {
        before: (n, state) => {
            state.startSummaryGroup()
        },
        after: (n, state) => {
            state.endSummaryGroupWith(n.obj, "mut")
        }
    },
    Save: {
        before: (n, state) => {
            state.startSummaryGroup()
        },
        after: (n, state) => {
            const {may_perform: children_did, uses_data_with_taints} = state.endSummaryGroup()
            const taint = state.taints.get(n.index)

            children_did.forEach(c => taint.add(c.id))
            uses_data_with_taints.forEach(c => taint.add(c))
            state.taints.set(n.index, taint)            
        }
    },

    Saved: {
        before: (n, state) => {
            
        },
        after: (n, state) => {
            state.applyToSummaryGroup(summary => {
                state.taints.get(n.index).forEach(global => summary.uses_data_with_taints.add(global))
                return summary
            })
        }
    },
    

    Update: {
        before: (n, state, this_visitor) => {
            state.startSummaryGroup() 
            switch (n.target.kind) {
                case "Saved":
                    break

                default:
                    throw Error(`Unexpected update target ${n.kind}`)
            }
            
            
            this_visitor.apply([n.operation])
            const summary = state.endSummaryGroup()
            const taint = n.operation.kind === "SetField" ? state.taints.get(n.target.index) : new Set<string>()
            summary.uses_data_with_taints.forEach(t => taint.add(t))
            summary.may_perform.forEach(c => taint.add(c.id))
            state.taints.set(n.target.index, taint)
        },
        after: (n, state) => {
            
            
        }

    },

    Conditional: {
        before: (n, state, this_visitor) => {
            state.startSummaryGroup()
            this_visitor.apply([n.cond])
            const condition_summary = state.endSummaryGroup()
            condition_summary.may_perform.forEach(c => state.globals_tainting_execution.add(c.id))
            condition_summary.may_perform.forEach(c => state.may_perform_any_or_all.push(c))
            condition_summary.uses_data_with_taints.forEach(c => state.globals_tainting_execution.add(c))

            this_visitor.apply([n.do])
        },
        after: (n, state, this_visitor) => {

        }
    }
}