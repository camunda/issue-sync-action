import { filterHumanAssignees, resolveTargetAssignees, TargetIssueAssigneesBehavior } from './assignees'
import { User } from './issue'

describe('filterHumanAssignees', () => {
    it('should keep regular users', () => {
        const assignees: User[] = [
            { login: 'alice', type: 'User' },
            { login: 'bob', type: 'User' },
        ]
        expect(filterHumanAssignees(assignees)).toEqual(['alice', 'bob'])
    })

    it('should filter out Bot accounts', () => {
        const assignees: User[] = [
            { login: 'alice', type: 'User' },
            { login: 'copilot[bot]', type: 'Bot' },
        ]
        expect(filterHumanAssignees(assignees)).toEqual(['alice'])
    })

    it('should filter out Organization accounts', () => {
        const assignees: User[] = [
            { login: 'alice', type: 'User' },
            { login: 'some-org', type: 'Organization' },
        ]
        expect(filterHumanAssignees(assignees)).toEqual(['alice'])
    })

    it('should keep users without type field (backwards compat)', () => {
        const assignees: User[] = [{ login: 'alice' } as User]
        expect(filterHumanAssignees(assignees)).toEqual(['alice'])
    })

    it('should return empty array when all assignees are bots', () => {
        const assignees: User[] = [
            { login: 'dependabot[bot]', type: 'Bot' },
            { login: 'copilot[bot]', type: 'Bot' },
        ]
        expect(filterHumanAssignees(assignees)).toEqual([])
    })

    it('should return empty array for no assignees', () => {
        expect(filterHumanAssignees([])).toEqual([])
    })
})

describe('resolveTargetAssignees', () => {
    const humanAssignees = ['alice', 'bob']
    const author = 'charlie'
    const staticAssignees = ['felix-mueller']

    describe('SkipSync', () => {
        it('should return undefined', () => {
            expect(
                resolveTargetAssignees(TargetIssueAssigneesBehavior.SkipSync, humanAssignees, author, staticAssignees)
            ).toBeUndefined()
        })
    })

    describe('AddSourceAuthor', () => {
        it('should combine source assignees with the author', () => {
            expect(
                resolveTargetAssignees(
                    TargetIssueAssigneesBehavior.AddSourceAuthor,
                    humanAssignees,
                    author,
                    staticAssignees
                )
            ).toEqual(['alice', 'bob', 'charlie'])
        })

        it('should deduplicate when author is already an assignee', () => {
            expect(
                resolveTargetAssignees(
                    TargetIssueAssigneesBehavior.AddSourceAuthor,
                    ['alice', 'charlie'],
                    'charlie',
                    staticAssignees
                )
            ).toEqual(['alice', 'charlie'])
        })
    })

    describe('AssignSourceAuthor', () => {
        it('should only use the source author', () => {
            expect(
                resolveTargetAssignees(
                    TargetIssueAssigneesBehavior.AssignSourceAuthor,
                    humanAssignees,
                    author,
                    staticAssignees
                )
            ).toEqual(['charlie'])
        })
    })

    describe('AddStatic', () => {
        it('should combine source assignees with static list', () => {
            expect(
                resolveTargetAssignees(TargetIssueAssigneesBehavior.AddStatic, humanAssignees, author, staticAssignees)
            ).toEqual(['alice', 'bob', 'felix-mueller'])
        })

        it('should work with empty source assignees (all bots filtered)', () => {
            expect(resolveTargetAssignees(TargetIssueAssigneesBehavior.AddStatic, [], author, staticAssignees)).toEqual(
                ['felix-mueller']
            )
        })

        it('should deduplicate overlapping assignees', () => {
            expect(
                resolveTargetAssignees(TargetIssueAssigneesBehavior.AddStatic, ['felix-mueller', 'alice'], author, [
                    'felix-mueller',
                ])
            ).toEqual(['felix-mueller', 'alice'])
        })
    })

    describe('AssignStatic', () => {
        it('should only use the static list', () => {
            expect(
                resolveTargetAssignees(
                    TargetIssueAssigneesBehavior.AssignStatic,
                    humanAssignees,
                    author,
                    staticAssignees
                )
            ).toEqual(['felix-mueller'])
        })
    })

    describe('end-to-end: Copilot assignee scenario', () => {
        it('should not include Copilot in AddStatic when source has Copilot + human', () => {
            // This is the exact scenario from the bug report:
            // Source issue has Copilot (Bot) and a human assigned,
            // behavior is AddStatic with felix-mueller
            const sourceUsers: User[] = [
                { login: 'tim-schuppener', type: 'User' },
                { login: 'Copilot', type: 'Bot' },
            ]
            const filtered = filterHumanAssignees(sourceUsers)
            const result = resolveTargetAssignees(TargetIssueAssigneesBehavior.AddStatic, filtered, 'tim-schuppener', [
                'felix-mueller',
            ])
            expect(result).toEqual(['tim-schuppener', 'felix-mueller'])
            expect(result).not.toContain('Copilot')
        })

        it('should only have static assignee when source has only Copilot', () => {
            // Source issue only has Copilot assigned
            const sourceUsers: User[] = [{ login: 'Copilot', type: 'Bot' }]
            const filtered = filterHumanAssignees(sourceUsers)
            const result = resolveTargetAssignees(TargetIssueAssigneesBehavior.AddStatic, filtered, 'some-author', [
                'felix-mueller',
            ])
            expect(result).toEqual(['felix-mueller'])
        })
    })
})
