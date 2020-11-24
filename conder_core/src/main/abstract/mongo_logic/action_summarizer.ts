import { apply, GraphAnalysis, Subscriptions } from './visitor';
import { ActionSequence } from './lock_calculation';
import { MongoNodeSet } from '../globals/mongo';
import { TargetNodeSet, NodeSet, PickTargetNode } from "../IR";
import { ScopeMap } from './scope_map';

type ActionSummarizer = (n: TargetNodeSet<MongoNodeSet>[]) => ActionSequence

type SummarizerState = {
    seq: ActionSequence
}

export const MONGO_ACTION_SUMMARIZER: ActionSummarizer = (nodes) => {
    const summary_analysis = new GraphAnalysis<SummarizerState>({}, {seq: []})
    apply(nodes, summary_analysis)
    return summary_analysis.state.seq
}

const SUMMARIZER_SUBSCRIPTIONS: Subscriptions<SummarizerState, keyof MongoNodeSet> = {
    GetKeyFromObject: {
        before: (n, state) => {
            state.seq.push({kind: 'get', id: n.obj})
        },
        after: (n, state) => {
        }
    },
    GetWholeObject: {
        before: (n, state) => {
            state.seq.push({kind: "get", id: n.name})
        },
        after: () => {

        }
    },
    keyExists: {
        before: (n, state) => {
            state.seq.push({kind: "get", id: n.obj})
        },
        after: () => {

        }
    },
    DeleteKeyOnObject: {
        before: (n, state) => {
            // TODO: ensure uses latest is accurate
            state.seq.push({kind: "mut", id: n.obj, usesLatest: []})
        },
        after: () => {

        }
    },
    SetKeyOnObject: {
        before: (n, state) => {
            state.seq.push({kind: "mut", id: n.obj, usesLatest: []})
        },
        after: () => {

        }
    }
}