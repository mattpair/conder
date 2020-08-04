

export type ConduitBuildConfig = {
    project: string;
    dependents?: {
        [path in string]: {
            language: "typescript";
        };
    };
};
