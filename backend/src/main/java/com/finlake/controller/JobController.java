package com.finlake.controller;

import com.finlake.dto.JobCreateRequestDTO;
import com.finlake.dto.JobCreateResponseDTO;
import com.finlake.dto.JobResultResponseDTO;
import com.finlake.dto.JobStatusResponseDTO;
import com.finlake.service.JobOrchestrationService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/storage/jobs")
public class JobController {

    private final JobOrchestrationService jobService;

    public JobController(JobOrchestrationService jobService) {
        this.jobService = jobService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.ACCEPTED)
    public JobCreateResponseDTO createJob(@RequestBody JobCreateRequestDTO req) {
        return jobService.submitJob(req);
    }

    @GetMapping
    public List<JobStatusResponseDTO> listJobs(
        @RequestParam(defaultValue = "50") int limit,
        @RequestParam(defaultValue = "0") int offset
    ) {
        return jobService.listJobs(limit, offset);
    }

    @GetMapping("/{jobId}")
    public ResponseEntity<JobStatusResponseDTO> getJobStatus(@PathVariable String jobId) {
        return jobService.getJobStatus(jobId)
            .map(ResponseEntity::ok)
            .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/{jobId}/result")
    public ResponseEntity<JobResultResponseDTO> getJobResult(@PathVariable String jobId) {
        return jobService.getJobResult(jobId)
            .map(ResponseEntity::ok)
            .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/{jobId}/cancel")
    public ResponseEntity<Map<String, String>> cancelJob(@PathVariable String jobId) {
        boolean cancelled = jobService.cancelJob(jobId);
        if (cancelled) {
            return ResponseEntity.ok(Map.of(
                "job_id", jobId,
                "status", "CANCELLED",
                "message", "Job '" + jobId + "' marked as CANCELLED."
            ));
        } else {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of(
                "job_id", jobId,
                "error", "Job not found or already in terminal state."
            ));
        }
    }

    @PostMapping("/{jobId}/retry")
    public ResponseEntity<Map<String, String>> retryJob(@PathVariable String jobId) {
        boolean queued = jobService.retryJob(jobId);
        if (queued) {
            return ResponseEntity.ok(Map.of(
                "job_id", jobId,
                "status", "ACCEPTED",
                "message", "Job '" + jobId + "' re-queued for processing."
            ));
        } else {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of(
                "job_id", jobId,
                "error", "Job not found."
            ));
        }
    }
}
