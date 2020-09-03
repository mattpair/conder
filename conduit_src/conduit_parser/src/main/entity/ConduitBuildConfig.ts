import { Python3Install } from './resolved';
export type ConduitBuildConfig = {
    project: string;
    dependents: {
        [path in string]: {
            language: "typescript";
        };
    };
    install?: Python3Install[];
};
