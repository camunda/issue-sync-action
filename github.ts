import { Octokit } from 'octokit'

export class GitHub {
    octokit: Octokit
    owner: string
    repo: string

    constructor(octokit: Octokit, owner: string, repo: string) {
        this.octokit = octokit
        this.owner = owner
        this.repo = repo
    }

    public getLabels(): Promise<any> {
        return this.octokit
            .request('GET /repos/{owner}/{repo}/labels', {
                owner: this.owner,
                repo: this.repo,
            })
            .then(response => {
                console.log(`Received ${response.data.length} labels for ${this.owner}/${this.repo}`)
                return response
            })
    }

    public createLabel(name: string, description: string, color: string): Promise<any> {
        return this.octokit
            .request('POST /repos/{owner}/{repo}/labels', {
                owner: this.owner,
                repo: this.repo,
                name,
                description,
                color,
            })
            .then(response => {
                console.log(`Created label ${response.data.url}`)
                return response
            })
    }

    public createIssue(title: string, body: string, labels: string[]): Promise<any> {
        return this.octokit
            .request('POST /repos/{owner}/{repo}/issues', {
                owner: this.owner,
                repo: this.repo,
                title,
                body,
                labels,
            })
            .then(response => {
                console.log(`Created issue for ${response.data.html_url}`)
                return response
            })
    }

    public editIssue(
        issueNumber: number,
        title: string,
        body: string,
        state?: 'open' | 'closed',
        labels?: string[]
    ): Promise<any> {
        return this.octokit
            .request('PATCH /repos/{owner}/{repo}/issues/{issue_number}', {
                owner: this.owner,
                repo: this.repo,
                issue_number: issueNumber,
                body,
                title,
                state,
                labels,
            })
            .then(response => {
                console.log(`Updated issue ${response.data.html_url}`)
                return response
            })
    }

    public getIssue(issueNumber: number): Promise<any> {
        return this.octokit
            .request('GET /repos/{owner}/{repo}/issues/{issue_number}', {
                owner: this.owner,
                repo: this.repo,
                issue_number: issueNumber,
            })
            .then(response => {
                console.log(`Received issue ${response.data.html_url}`)
                return response
            })
    }

    public createComment(issueNumber: number, body: string): Promise<any> {
        return this.octokit
            .request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
                owner: this.owner,
                repo: this.repo,
                issue_number: issueNumber,
                body,
            })
            .then(response => {
                console.log(`Created comment ${response.data.html_url}`)
                return response
            })
    }

    public getComment(commentId: number): Promise<any> {
        return this.octokit
            .request('GET /repos/{owner}/{repo}/issues/comments/{comment_id}', {
                owner: this.owner,
                repo: this.repo,
                comment_id: commentId,
            })
            .then(response => {
                console.log(`Received comment ${response.data.html_url}`)
                return response
            })
    }

    public getIssueNumberByTitle(issueTitle: string): Promise<number> {
        // Find issue number from target repo where the issue title matches the title of the issue in the source repo
        // Sort by created and order by ascending to select the oldest created issue of that title
        // Octokit automatically encoded the query
        return this.octokit
            .request('GET /search/issues', {
                q: `repo:${this.owner}/${this.repo}+in:title+type:issue+${issueTitle}`,
                sort: 'created',
                order: 'asc',
                per_page: 100,
            })
            .then(response => {
                console.log(`Found a total of ${response.data.total_count} issues that fit the query.`)
                const targetIssue = response.data.items.find(targetIssue => targetIssue.title === issueTitle)
                return (targetIssue || {}).number
            })
    }
}
