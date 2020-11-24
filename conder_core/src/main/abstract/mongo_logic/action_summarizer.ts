import { apply, DummyVisitor, Subscriptions } from './visitor';
import { PickTargetNode } from './../IR';
import { ActionSequence } from './lock_calculation';
import { MongoNodeSet } from '../globals/mongo';
import { TargetNodeSet, NodeSet } from "../IR";
import { ScopeMap } from './scope_map';

type ActionSummarizer = (n: TargetNodeSet<MongoNodeSet>[]) => ActionSequence

export const MONGO_ACTION_SUMMARIZER: ActionSummarizer = (nodes) => {
    const action_summary_producer = new ActionSummaryBuilder()
    apply(nodes, new DummyVisitor(action_summary_producer))
    return action_summary_producer.seq
}

type GlobalTaints = Set<string>


class ActionSummaryBuilder implements Subscriptions {
    
    seq: ActionSequence = []


    Return: {
        before: () => {

        }
        after: () => {

        }
    }
}
