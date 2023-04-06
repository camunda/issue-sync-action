import * as core from '@actions/core'
import * as github from '@actions/github'
import { Octokit } from 'octokit'
import { Issue, IssueComment } from './issue'
import { GitHub } from './github'
import { LabelSyncer } from './labelSyncer'
import { Utils } from './utils'

let ownerSource = ''
let repoSource = ''
let ownerTarget = ''
let repoTarget = ''
let githubTokenSource = ''
let githubTokenTarget = ''
let githubToken = ''
let additionalIssueLabels: string[] = []
let skipCommentSyncKeywords: string[] = []
let skippedCommentMessage: string
let syncRepoLabels: boolean
let targetIssueFooterTemplate = ''
let targetCommentFooterTemplate = ''
let issueCreatedCommentTemplate = ''
let useCommentForIssueMatching: boolean = false
let ONLY_SYNC_ON_LABEL: string
let CREATE_ISSUES_ON_EDIT: boolean
let ONLY_SYNC_MAIN_ISSUE: boolean

// Determine which context we are running from
if (process.env.CI == 'true') {
    console.log('Reading params from actions context...')
    // Read source and target repos
    const source = core.getInput('repo_source')
        ? core.getInput('repo_source')
        : github.context.repo.owner + '/' + github.context.repo.repo
    const target = core.getInput('repo_target')
    ;[ownerSource, repoSource] = source.split('/')
    ;[ownerTarget, repoTarget] = target.split('/')

    // Read token and params
    githubToken = process.env.GITHUB_TOKEN
    githubTokenSource = process.env.GITHUB_TOKEN_SOURCE || githubToken
    githubTokenTarget = process.env.GITHUB_TOKEN_TARGET || githubToken
    additionalIssueLabels = core
        .getInput('additional_issue_labels')
        .split(',')
        .map(x => x.trim())
        .filter(x => x)
    syncRepoLabels = core.getBooleanInput('sync_repo_labels')
    targetIssueFooterTemplate = core.getInput('target_issue_footer_template')
    targetCommentFooterTemplate = core.getInput('target_comment_footer_template')
    skipCommentSyncKeywords = core
        .getInput('skip_comment_sync_keywords')
        .split(',')
        .map(x => x.trim())
        .filter(x => x)
    skippedCommentMessage = core.getInput('skipped_comment_message')
    issueCreatedCommentTemplate = core.getInput('issue_created_comment_template')
    useCommentForIssueMatching = core.getBooleanInput('use_comment_for_issue_matching')
    ONLY_SYNC_ON_LABEL = core.getInput('only_sync_on_label')
    CREATE_ISSUES_ON_EDIT = core.getBooleanInput('create_issues_on_edit')
    ONLY_SYNC_MAIN_ISSUE = core.getBooleanInput('only_sync_main_issue')

    console.log(`Repos: ${ownerSource}/${repoSource} -> ${ownerTarget}/${repoTarget}`)
    console.log(`Only sync on label: ${ONLY_SYNC_ON_LABEL}`)
    console.log(`Do not sync comments: ${ONLY_SYNC_MAIN_ISSUE}`)
    console.log(`Create missing issues on edit events: ${CREATE_ISSUES_ON_EDIT}`)
    console.log(`Additional labels for target issue: ${additionalIssueLabels}`)
    console.log(`Sync labels from source to target repo: ${syncRepoLabels}`)
    console.log(`Target issues footer template: ${targetIssueFooterTemplate}`)
    console.log(`Target comments footer template: ${targetCommentFooterTemplate}`)
    console.log(`Issue created template: ${issueCreatedCommentTemplate}`)
} else {
    console.log('Reading params from CLI context...')
    // read all variables from launch parameters
    const launchArgs = process.argv
    for (let i = 0; i < launchArgs.length; i++) {
        if (launchArgs[i] === '--owner_source') {
            ownerSource = launchArgs[i + 1]
        } else if (launchArgs[i] === '--repo_source') {
            repoSource = launchArgs[i + 1]
        } else if (launchArgs[i] === '--owner_target') {
            ownerTarget = launchArgs[i + 1]
        } else if (launchArgs[i] === '--repo_target') {
            repoTarget = launchArgs[i + 1]
        } else if (launchArgs[i] === '--github_token') {
            githubToken = launchArgs[i + 1]
        } else if (launchArgs[i] === '--github_token_source') {
            githubTokenSource = launchArgs[i + 1]
        } else if (launchArgs[i] === '--github_token_target') {
            githubTokenTarget = launchArgs[i + 1]
        } else if (launchArgs[i] === '--additional_issue_labels') {
            additionalIssueLabels = launchArgs[i + 1]
                .split(',')
                .map(x => x.trim())
                .filter(x => x)
        } else if (launchArgs[i] === '--sync_repo_labels') {
            syncRepoLabels = launchArgs[i + 1].toLowerCase() == 'true'
        } else if (launchArgs[i] === '--target_issue_footer_template') {
            targetIssueFooterTemplate = launchArgs[i + 1]
        } else if (launchArgs[i] === '--target_comment_footer_template') {
            targetCommentFooterTemplate = launchArgs[i + 1]
        } else if (launchArgs[i] === '--skip_comment_sync_keywords') {
            skipCommentSyncKeywords = launchArgs[i + 1]
                .split(',')
                .map(x => x.trim())
                .filter(x => x)
        } else if (launchArgs[i] == '--skipped_comment_message') {
            skippedCommentMessage = launchArgs[i + 1]
        } else if (launchArgs[i] == '--issue_created_comment_template') {
            issueCreatedCommentTemplate = launchArgs[i + 1]
        } else if (launchArgs[i] == '--use_comment_for_issue_matching') {
            useCommentForIssueMatching = launchArgs[i + 1].toLowerCase() == 'true'
        }
    }
}

const gitHubSource = new GitHub(new Octokit({ auth: githubTokenSource }), ownerSource, repoSource)
const gitHubTarget = new GitHub(
    githubTokenSource == githubTokenTarget ? gitHubSource.octokit : new Octokit({ auth: githubTokenTarget }),
    ownerTarget,
    repoTarget
)

let utils = new Utils(
    targetIssueFooterTemplate,
    targetCommentFooterTemplate,
    skipCommentSyncKeywords,
    skippedCommentMessage,
    issueCreatedCommentTemplate
)

if (syncRepoLabels) {
    LabelSyncer.syncLabels(gitHubSource, gitHubTarget)
        .then(() => console.log('Successfully synced labels'))
        .catch(err => {
            console.error('Failed to sync labels', err)
        })
}

const payload = require(process.env.GITHUB_EVENT_PATH as string)
const action: string = payload.action
const sourceIssueNumber = (payload.issue || payload.pull_request || payload).number
const sourceIssue: Issue = payload.issue

const targetLabels: string[] = [...new Set(sourceIssue.labels.map(label => label.name).concat(additionalIssueLabels))]

// If flag for only syncing labelled issues is set, check if issue has label of specified sync type
const skipSync = ONLY_SYNC_ON_LABEL && !sourceIssue.labels.find(label => label.name === ONLY_SYNC_ON_LABEL)

console.log(`Found issue ${sourceIssueNumber}: ${sourceIssue.title}`)
console.log(`Labels: ${targetLabels}`)

switch (process.env.GITHUB_EVENT_NAME) {
    case 'issue_comment':
        // If flag for only syncing issue bodies is set and skip if true
        if (ONLY_SYNC_MAIN_ISSUE || skipSync) break

        const sourceComment: IssueComment = payload.comment
        const targetIssueCommentBody = utils.getIssueCommentTargetBody(sourceComment)

        if (utils.isIssueCreatedComment(gitHubTarget, targetIssueCommentBody)) {
            console.log('Skipping the service comment sync')
            break
        }

        utils
            .getIssueNumber(
                gitHubSource,
                gitHubTarget,
                useCommentForIssueMatching,
                sourceIssueNumber,
                sourceIssue.title
            )
            .then(targetIssueNumber => {
                console.log(`target_issue_id:${targetIssueNumber}`)
                core.setOutput('issue_id_target', targetIssueNumber)

                if (action == 'created') {
                    gitHubTarget.createComment(targetIssueNumber, targetIssueCommentBody).then(response => {
                        // set target comment id for GH output
                        core.setOutput('comment_id_target', response.data.id)
                        gitHubSource.reactOnComment(sourceComment.id, 'rocket')
                        console.info('Successfully created new comment on issue')
                    })
                } else {
                    // edited or deleted
                    gitHubTarget.getComments(targetIssueNumber).then(targetComments => {
                        const targetCommentMatch = utils.findTargetComment(sourceComment, targetComments)
                        if (targetCommentMatch) {
                            if (action == 'edited') {
                                gitHubTarget
                                    .editComment(targetCommentMatch.id, targetIssueCommentBody)
                                    .then(response => {
                                        // set target comment id for GH output
                                        core.setOutput('comment_id_target', response.data.id)
                                        console.info('Successfully updated a comment on issue')
                                    })
                            } else if (action == 'deleted') {
                                gitHubTarget.deleteComment(targetCommentMatch.id)
                            }
                        }
                    })
                }
            })
        break
    case 'issues':
        // If the issue was updated, we need to sync labels
        if (skipSync) break
        const targetIssueBody = utils.getIssueTargetBody(sourceIssue)

        switch (action) {
            case 'opened':
                // Create new issue in target repo
                gitHubTarget
                    .createIssue(sourceIssue.title, targetIssueBody, targetLabels)
                    .then(response => {
                        console.log('Created issue:', response.data.title)
                        // set target issue id for GH output
                        console.log(`target_issue_id:${response.data.id}`)
                        core.setOutput('issue_id_target', response.data.id)
                        gitHubSource.reactOnIssue(sourceIssueNumber, 'rocket')
                        if (utils.issueCreatedCommentTemplate.trim()) {
                            gitHubSource.createComment(
                                sourceIssueNumber,
                                utils.getIssueCreatedComment(gitHubTarget, response.data.number)
                            )
                        }
                    })
                    .catch(err => {
                        let msg = 'Error creating issue:'
                        console.error(msg, err)
                        core.setFailed(`${msg} ${err}`)
                    })
                break
            case 'edited':
            case 'closed':
            case 'reopened':
            case 'labeled':
            case 'unlabeled':
                utils
                    .getIssueNumber(
                        gitHubSource,
                        gitHubTarget,
                        useCommentForIssueMatching,
                        sourceIssueNumber,
                        sourceIssue.title
                    )
                    .then(targetIssueNumber => {
                        if (targetIssueNumber) {
                            // set target issue id for GH output
                            console.log(`target_issue_id:${targetIssueNumber}`)
                            core.setOutput('issue_id_target', targetIssueNumber)
                            // Update issue in target repo
                            gitHubTarget
                                .editIssue(
                                    targetIssueNumber,
                                    sourceIssue.title,
                                    targetIssueBody,
                                    sourceIssue.state,
                                    sourceIssue.state_reason,
                                    targetLabels
                                )
                                .then(response => {
                                    console.log('Updated issue:', response.data.title)
                                    gitHubSource.reactOnIssue(sourceIssueNumber, 'rocket')
                                })
                                .catch(err => {
                                    console.error('Error updating issue:', err)
                                })
                        } else {
                            console.error('Could not find matching issue in target repo for title', sourceIssue.title)

                            if (CREATE_ISSUES_ON_EDIT || action == 'labeled') {
                                // Create issue anew
                                gitHubTarget
                                    .createIssue(sourceIssue.title, targetIssueBody, targetLabels)
                                    .then(response => {
                                        // set target issue id for GH output
                                        core.setOutput('issue_id_target', response.data.number)
                                        console.log('Created issue for lack of a match:', response.data.title)
                                        gitHubSource.reactOnIssue(sourceIssueNumber, 'rocket')
                                        if (utils.issueCreatedCommentTemplate.trim()) {
                                            gitHubSource.createComment(
                                                sourceIssueNumber,
                                                utils.getIssueCreatedComment(gitHubTarget, response.data.number)
                                            )
                                        }
                                    })
                                    .catch(err => {
                                        let msg = 'Error creating issue for lack of a match:'
                                        console.error(msg, err)
                                        core.setFailed(`${msg} ${err}`)
                                    })
                            }
                        }
                    })
                    .catch(err => {
                        let msg = 'Error finding issue in target repo:'
                        console.error(msg, err)
                        core.setFailed(`${msg} ${err}`)
                    })
                break
            default:
                console.log(`We are currently not handling events of type ${action}`)
                break
        }
        break
    default:
        break
}
