import { User } from './issue'

export enum TargetIssueAssigneesBehavior {
    SkipSync = 'skip_sync',
    AddSourceAuthor = 'add_source_author',
    AssignSourceAuthor = 'assign_source_author',
    AddStatic = 'add_static',
    AssignStatic = 'assign_static',
}

/**
 * Filters out non-user assignees (bots, apps, etc.) from a list of GitHub users.
 * Only keeps users with type "User" or with no type field (for backwards compatibility).
 */
export function filterHumanAssignees(assignees: User[]): string[] {
    return assignees.filter(x => !x.type || x.type === 'User').map(x => x.login)
}

/**
 * Resolves the target issue assignees based on the configured behavior.
 * Returns undefined when assignees should not be synced (SkipSync or unknown behavior).
 */
export function resolveTargetAssignees(
    behavior: TargetIssueAssigneesBehavior,
    sourceAssignees: string[],
    sourceAuthor: string,
    staticAssignees: string[]
): string[] | undefined {
    let result: string[] | undefined = undefined

    switch (behavior) {
        case TargetIssueAssigneesBehavior.AddSourceAuthor:
            result = sourceAssignees.concat([sourceAuthor])
            break
        case TargetIssueAssigneesBehavior.AssignSourceAuthor:
            result = [sourceAuthor]
            break
        case TargetIssueAssigneesBehavior.AddStatic:
            result = sourceAssignees.concat(staticAssignees)
            break
        case TargetIssueAssigneesBehavior.AssignStatic:
            result = staticAssignees
            break
    }

    if (result) {
        result = [...new Set(result.filter(x => x))]
    }

    return result
}
