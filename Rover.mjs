#!/usr/bin/env node

// @ts-nocheck

import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { diffLines } from "diff/lib/index.js";
import chalk from "chalk";
import { Command } from "commander";

const program = new Command();

class Rover {
  constructor(repoPath = ".") {
    this.repoPath = path.join(repoPath, ".rover");
    this.objectsPath = path.join(this.repoPath, "objects");
    this.headPath = path.join(this.repoPath, "HEAD");
    this.indexPath = path.join(this.repoPath, "index"); //will keep details of the files going to the staging area
    this.init();
  }
  async init() {
    await fs.mkdir(this.objectsPath, { recursive: true });
    try {
      await fs.writeFile(this.headPath, "", { flag: "wx" }); // w-> initialize the file and start writing in it , x-> fail if file is created already.
      await fs.writeFile(this.indexPath, JSON.stringify([]), { flag: "wx" });
    } catch (error) {
      console.log("Already initialized the .rover folder");
    }
  }

  hashObject(content) {
    return crypto.createHash("sha1").update(content, "utf-8").digest("hex");
  }
  async addFile(fileToBeAdded) {
    const fileData = await fs.readFile(fileToBeAdded, { encoding: "utf-8" });
    const fileHash = this.hashObject(fileData);
    console.log(fileHash);
    const newHashFileobjectPath = path.join(this.objectsPath, fileHash);
    await fs.writeFile(newHashFileobjectPath, fileData);
    await this.updateStagingArea(fileToBeAdded, fileHash);
    console.log(`Added ${fileToBeAdded}`);
  }

  async updateStagingArea(filePath, fileHash) {
    const index = JSON.parse(
      await fs.readFile(this.indexPath, { encoding: "utf-8" })
    );
    index.push({ path: filePath, hash: fileHash });
    await fs.writeFile(this.indexPath, JSON.stringify(index));
  }

  async commit(message) {
    const index = JSON.parse(
      await fs.readFile(this.indexPath, { encoding: "utf-8" })
    );
    const parentCommit = await this.getCurrentHead();
    const commitData = {
      timestamp: new Date().toISOString(),
      message,
      files: index,
      parent: parentCommit,
    };

    const commitHash = this.hashObject(JSON.stringify(commitData));
    const commitPath = path.join(this.objectsPath, commitHash);
    await fs.writeFile(commitPath, JSON.stringify(commitData)); //updating the head to the new commit
    await fs.writeFile(this.headPath, commitHash);
    await fs.writeFile(this.indexPath, JSON.stringify([]));
    //clear my staging area
    console.log(`commit successfully created : ${commitHash}`);
  }

  async getCurrentHead() {
    try {
      return await fs.readFile(this.headPath, { encoding: "utf-8" });
    } catch (error) {
      return null;
    }
  }
  async log() {
    let currentCommmitHash = await this.getCurrentHead();
    while (currentCommmitHash) {
      const commitData = JSON.parse(
        await fs.readFile(path.join(this.objectsPath, currentCommmitHash), {
          encoding: "utf-8",
        })
      );
      console.log(`~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n`);
      console.log(
        `Commit : ${currentCommmitHash}\n Date: ${commitData.timestamp}\n\n ${commitData.message}\n\n`
      );
      currentCommmitHash = commitData.parent;
    }
  }
  async showCommitDiff(commitHash) {
    const commitData = JSON.parse(await this.getCommitData(commitHash)); //error line 2
    if (!commitData) {
      console.log("Commit was not found");
      return;
    } else {
      console.log("Changes from the last commit are : ");
    }
    for (const file of commitData.files) {
      console.log(`File : ${file.path}`);
      const fileContent = await this.getFileContent(file.hash);
      console.log(fileContent);
      if (commitData.parent) {
        const parentCommitData = JSON.parse(
          this.getCommitData(commitData.parent)
        );
        const getParentFileContent = await this.getParentFileContent(
          parentCommitData,
          file.path
        );
        if (getParentFileContent !== undefined) {
          console.log("\nDiff : ");
          const diff = diffLines(getParentFileContent, fileContent);
          console.log(diff);
          diff.forEach((part) => {
            if (part.added) {
              process.stdout.write(chalk.green(part.value));
            } else if (part.removed) {
              process.stdout.write(chalk.green(part.value));
            } else {
              process.stdout.write(chalk.yellow(part.value));
            }
          });
          console.log();
        } else {
          console.log("New file in this commit ");
        }
      } else {
        console.log("this is the first commit ");
      }
    }
  }
  async getParentFileContent(parentCommitData, filePath) {
    const parentFile = parentCommitData.files.find(
      (file) => file.path === filePath
    );
    if (parentFile) {
      // get the file content from the parent commit and return the content
      return await this.getFileContent(parentFile.hash);
    }
  }
  async getCommitData(commithash) {
    const commitPath = path.join(this.objectsPath, commithash);
    try {
      return await fs.readFile(commitPath, { encoding: "utf-8" }); //error line
    } catch (error) {
      console.log("Could not read commit Data  ", error);
      return null;
    }
  }
  async getFileContent(fileHash) {
    const objectPath = path.join(this.objectsPath, fileHash);
    return fs.readFile(objectPath, { encoding: "utf-8" });
  }
}
// (async () => {
//   const rover = new Rover();
//     await rover.addFile("sample.txt");
//     await rover.commit("third commit");

//     await rover.log();
//   await rover.showCommitDiff(`42d889408f28482849e15f31d814187e340642ca`);
// })();

program.command("init").action(async () => {
  const rover = new Rover();
});

program.command("add <file>").action(async (file) => {
  const rover = new Rover();
  await rover.addFile(file);
});

program.command("commit <message>").action(async (message) => {
  const rover = new Rover();
  await rover.commit(message);
});

program.command("log").action(async () => {
  const rover = new Rover();
  await rover.log();
});

program.command("show <commitHash>").action(async (commitHash) => {
  const rover = new Rover();
  await rover.showCommitDiff(commitHash);
});

program.parse(process.argv);