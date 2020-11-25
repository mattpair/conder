import { GraphAnalysis, Subscriptions } from '../../data_structures/visitor';
import { Action, ActionSequence, Mutation } from './lock_calculation';
import { MongoNodeSet } from '../globals/mongo';
import { TargetNodeSet, NodeSet, PickTargetNode } from "../IR";
import { ScopeMap } from '../../data_structures/scope_map';
import { StackOfSets } from 'src/main/data_structures/stack_of_sets';

type ActionSummarizer = (n: TargetNodeSet<MongoNodeSet>[]) => ActionSequence

type NodeSummary = {
    children_did: ActionSequence
}

type SummarizerState = {
    active: NodeSummary[]
    cumulated_actions: ActionSequence,
}

export const MONGO_ACTION_SUMMARIZER: ActionSummarizer = (nodes) => {
    const summary_analysis = new GraphAnalysis<SummarizerState>(
        SUMMARIZER_SUBSCRIPTIONS,
        {cumulated_actions: [], active: []})
    summary_analysis.apply(nodes)
    return summary_analysis.state.cumulated_actions
}

const SUMMARIZER_SUBSCRIPTIONS: Subscriptions<SummarizerState, keyof MongoNodeSet> = {
    GetKeyFromObject: {
        before: (n, state) => {
            state.active.push({children_did: []})
        },
        after: (n, state) => {
            const this_action: Action<"get"> = {kind: "get", id: n.obj}
            const {children_did} = state.active.pop()
            const parent = state.active.pop()
            if (parent) {
                parent.children_did.push(...children_did, this_action)
                state.active.push(parent)
            }
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
            state.active.push({children_did: []})
        },
        after: (n, state) => {
            const {children_did} = state.active.pop()
            const this_action: Action<"get"> = {kind: "get", id: n.obj}
            const parent = state.active.pop()
            if (parent) {
                parent.children_did.push(...children_did, this_action)
                state.active.push(parent)
            }
            state.cumulated_actions.push(this_action)
        }
    },
    DeleteKeyOnObject: {
        before: (n, state) => {
            state.active.push({children_did: []})
        },
        after: (n, state) => {
            const {children_did} = state.active.pop()
            const this_action = new Mutation(n.obj, children_did.map(c => c.id))
            const parent = state.active.pop()
            if (parent) {
                parent.children_did.push(...children_did, this_action)
                state.active.push(parent)
            }
            state.cumulated_actions.push(this_action)
        }
    },
    SetKeyOnObject: {
        before: (n, state) => {
            state.active.push({children_did: []})
        },
        after: (n, state) => {
            const {children_did} = state.active.pop()
            const this_action = new Mutation(n.obj, children_did.map(c => c.id))
            const parent = state.active.pop()
            if (parent) {
                parent.children_did.push(...children_did, this_action)
                state.active.push(parent)
            }
            state.cumulated_actions.push(this_action) 
        }
    }
}