import { DefaultMap } from './../../data_structures/default_map';
import { GraphAnalysis, Subscriptions } from '../../data_structures/visitor';
import { Stack } from '../../data_structures/Stack';
import { Action, ActionSequence, Mutation } from './lock_calculation';
import { MongoNodeSet } from '../globals/mongo';
import { TargetNodeSet, NodeSet, PickTargetNode } from "../IR";

type ActionSummarizer = (n: TargetNodeSet<MongoNodeSet>[]) => ActionSequence

type NodeSummary = {
    children_did: ActionSequence,
    uses_data_with_taints: Set<string>
}

type SummarizerState = {
    active: Stack<NodeSummary>,
    taints: DefaultMap<number, Set<string>>
    cumulated_actions: ActionSequence,
}

export const MONGO_ACTION_SUMMARIZER: ActionSummarizer = (nodes) => {
    const summary_analysis = new GraphAnalysis<SummarizerState>(
        SUMMARIZER_SUBSCRIPTIONS,
        {
            cumulated_actions: [], 
            active: new Stack(() => ({children_did: [], uses_data_with_taints: new Set()})), 
            taints: new DefaultMap(() => new Set())
        })
    summary_analysis.apply(nodes)
    return summary_analysis.state.cumulated_actions
}

const SUMMARIZER_SUBSCRIPTIONS: Subscriptions<SummarizerState, keyof MongoNodeSet> = {
    GetKeyFromObject: {
        before: (n, state) => {
            state.active.push()
        },
        after: (n, state) => {
            const this_action: Action<"get"> = {kind: "get", id: n.obj}
            const {children_did} = state.active.pop()
            state.active.apply_to_last(parent => {
                parent.children_did.push(...children_did, this_action)
                return parent
            })
            state.cumulated_actions.push(this_action)
        }
    },
    GetWholeObject: {
        before: (n, state) => {

        },
        after: (n, state) => {
            state.cumulated_actions.push({kind: "get", id: n.name})
        }
    },
    keyExists: {
        before: (n, state) => {
            state.active.push()
        },
        after: (n, state) => {
            const {children_did} = state.active.pop()
            const this_action: Action<"get"> = {kind: "get", id: n.obj}
            state.active.apply_to_last(parent => {
                parent.children_did.push(...children_did, this_action)
                return parent
            })

            state.cumulated_actions.push(this_action)
        }
    },
    DeleteKeyOnObject: {
        before: (n, state) => {
            state.active.push()
        },
        after: (n, state) => {
            const {children_did, uses_data_with_taints} = state.active.pop()
            const this_action = new Mutation(n.obj, [...children_did.map(c => c.id), ...uses_data_with_taints.values()])
            state.active.apply_to_last(parent => {
                parent.children_did.push(...children_did, this_action)
                return parent
            })
            state.cumulated_actions.push(this_action)
        }
    },
    SetKeyOnObject: {
        before: (n, state) => {
            state.active.push()
        },
        after: (n, state) => {
            const {children_did, uses_data_with_taints} = state.active.pop()
            const this_action = new Mutation(n.obj, [...children_did.map(c => c.id), ...uses_data_with_taints.values()])
            state.active.apply_to_last(parent => {
                parent.children_did.push(...children_did, this_action)
                return parent
            })
            state.cumulated_actions.push(this_action) 
        }
    },
    Save: {
        before: (n, state) => {
            state.active.push()
        },
        after: (n, state) => {
            const {children_did} = state.active.pop()
            if (children_did.length > 0) {
                const taint = state.taints.get(n.index)
                children_did.forEach(c => taint.add(c.id))
                state.taints.set(n.index, taint)
            }
        }
    },

    Saved: {
        before: (n, state) => {
            
        },
        after: (n, state) => {
            state.active.apply_to_last(parent => {
                state.taints.get(n.index).forEach(global => parent.uses_data_with_taints.add(global))
                return parent
            })
        }
    }
}