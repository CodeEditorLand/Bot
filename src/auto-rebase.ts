import { getTitleOfLatestCommit, octokit, owner, repo } from "./util/octokit";

// We only auto-rebase if the latest commit message is one of
//
// - test(*)
// - chore:


function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

(async () => {
    const latestCommitMessage = await getTitleOfLatestCommit();

    console.log(`Latest commit message: ${latestCommitMessage}`);

    if (!latestCommitMessage.startsWith("chore:")) {
        console.log(
            `Auto rebase script cannot work because the latest commit may require a version bump`
        );
        return;
    }

    const allPrs = await octokit.rest.pulls.list({
        owner,
        repo,
        state: "open",
        sort: "long-running",
        direction: "desc",
    });

    const autoMergePrs = allPrs.data.filter((pr) => !!pr.auto_merge);

    if (autoMergePrs.length === 0) {
        console.log(`No PRs with auto-merge enabled`);
        return;
    }

    for (const pr of autoMergePrs) {
        try {
            const baseBranch = await octokit.rest.repos.getBranch({
                owner,
                repo,
                branch: pr.base.ref,
            });
            if (baseBranch.data.commit.sha === pr.base.sha) {
                console.error(`PR #${pr.number} is already up-to-date`);
                continue;
            }

            await octokit.rest.pulls.updateBranch({
                owner,
                repo,
                pull_number: pr.number,
                expected_head_sha: pr.head.sha,
            });

            console.log(`Updated PR ${pr.number} to merge upstream`);

            await sleep(3000);

            const review = await octokit.pulls.createReview({
                owner,
                repo,
                pull_number: pr.number,
            });
            console.log(`Created a review on PR ${pr.number}`);

            await octokit.pulls.submitReview({
                owner,
                repo,
                pull_number: pr.number,
                review_id: review.data.id,
                event: "COMMENT",
                body: "Automated review comment generated by auto-rebase script",
            });

            break;
        } catch (e) {
            console.error(`Failed to auto-rebase:`, e);
        }
    }
})();
