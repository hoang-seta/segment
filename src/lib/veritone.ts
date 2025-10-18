import fetch from "node-fetch";

const GRAPHQL_ENDPOINT = "https://api.stage.us-1.veritone.com/v3/graphql";
const API_TOKEN = process.env['VERITONE_TOKEN'] as string;

interface GraphQLResponse {
    data?: {
        createJob: {
            id: string;
        };
    };
    errors?: Array<{
        message: string;
    }>;
}

async function runClippingSegmentVideo(url: string): Promise<string> {
    const mutation = `
  mutation runClippingSegmentVideo {
    createJob(
      input: {
        target: { status: "downloaded" }
        tasks: [
          {
            engineId: "9e611ad7-2d3b-48f6-a51b-0a1ba40fe255"
            payload: { url: "${url}" }
            ioFolders: [{ referenceId: "wsaOutput", mode: stream, type: output }]
            executionPreferences: { priority: -95 }
          }
          {
            engineId: "8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440"
            payload: {
              ffmpegTemplate: "video"
              customFFMPEGProperties: { chunkSizeInSeconds: "300" }
            }
            ioFolders: [
              { referenceId: "chunkVideoInput", mode: stream, type: input }
              { referenceId: "chunkVideoOutput", mode: chunk, type: output }
            ]
            executionPreferences: {
              parentCompleteBeforeStarting: true
              priority: -95
            }
          }
          {
            engineId: "4a8e3cc4-04b8-430b-bbbe-cac33d6b5b23"
            ioFolders: [
              { referenceId: "objectInput", mode: chunk, type: input }
              { referenceId: "objectOutput", mode: chunk, type: output }
            ]
            executionPreferences: {
              maxEngines: 10
              parentCompleteBeforeStarting: true
              priority: -95
            }
          }
          {
            engineId: "8eccf9cc-6b6d-4d7d-8cb3-7ebf4950c5f3"
            ioFolders: [{ referenceId: "owInput", mode: chunk, type: input }]
            executionPreferences: {
              parentCompleteBeforeStarting: true
              priority: -95
            }
          }
        ]
        routes: [
          {
            parentIoFolderReferenceId: "wsaOutput"
            childIoFolderReferenceId: "chunkVideoInput"
          }
          {
            parentIoFolderReferenceId: "chunkVideoOutput"
            childIoFolderReferenceId: "objectInput"
          }
          {
            parentIoFolderReferenceId: "objectOutput"
            childIoFolderReferenceId: "owInput"
          }
        ]
      }
    ) {
      id
    }
  }`;

    try {
        const response = await fetch(GRAPHQL_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${API_TOKEN}`,
            },
            body: JSON.stringify({ query: mutation }),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            const text = await response.text();
            throw new Error(`Expected JSON response but got: ${text}`);
        }

        const result = await response.json() as GraphQLResponse;

        if (result.errors) {
            console.error("❌ GraphQL errors:", JSON.stringify(result.errors, null, 2));
        } else if (result.data) {
            console.dir(result.data.createJob, { depth: null });
        }
        return result.data?.createJob?.id || '';
    } catch (error) {
        console.error("🚨 Request failed:", error);
        return '';
    }
}

interface GetJobStatusResponse {
    data: {
        sourceId: string;
        engineResults: {
            sourceId: string;
            records: {
                jsondata: {
                    series: {
                        startTimeMs: number;
                        stopTimeMs: number;
                        object: {
                            label: string;
                            type: string;
                            confidence: number;
                        };
                    }[];
                };
            }[];
        };
    };
    errors?: Array<{
        message: string;
        locations?: Array<{ line: number; column: number }>;
    }>;
}
interface StartAndEndTime {
    startTimeMs: number;
    stopTimeMs: number;
}

async function getJobStatus(jobId: string): Promise<{ startAndEndTime: StartAndEndTime[], isCompleted: boolean }> {
    console.log("getting job status, jobId: ", jobId);
    const query = `
    query getJobStatus {
        engineResults(jobId: "${jobId}") {
            records {
                jsondata
            }
        }
    }
    `;
    const response = await fetch(GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${API_TOKEN}`,
        },
        body: JSON.stringify({ query: query }),
    });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        throw new Error(`Expected JSON response but got: ${text}`);
    }
    const result = await response.json() as GetJobStatusResponse;
    if (result.data.engineResults.records.length === 0) {
        return { startAndEndTime: [], isCompleted: false };
    }
    let startAndEndTime: StartAndEndTime[] = [];
    for (const record of result.data.engineResults.records) {
        for (const series of record.jsondata.series) {
            console.log("series: ", series);
            if (series.object.label !== 'Shot') {
                continue;
            }
            if (series.stopTimeMs - series.startTimeMs > 9000) {
                let stopTimeMs = series.stopTimeMs;
                if (series.stopTimeMs - series.startTimeMs > 20000) {
                    stopTimeMs = series.startTimeMs + 20000;
                }
                startAndEndTime.push({
                    startTimeMs: series.startTimeMs,
                    stopTimeMs: stopTimeMs,
                });
            }
        }
    }
    return { startAndEndTime: startAndEndTime, isCompleted: true };
}

export {
    getJobStatus, runClippingSegmentVideo
};

