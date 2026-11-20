package com.finlake.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public record KafkaSinkStatusDTO(
    @JsonProperty("status")
    String status,

    @JsonProperty("bootstrap_servers")
    String bootstrapServers,

    @JsonProperty("active_topics")
    List<String> activeTopics,

    @JsonProperty("total_messages_received")
    long totalMessagesReceived,

    @JsonProperty("total_batches_sunk")
    long totalBatchesSunk,

    @JsonProperty("total_bytes_written_to_minio")
    long totalBytesWrittenToMinio,

    @JsonProperty("last_sink_timestamp")
    LocalDateTime lastSinkTimestamp,

    @JsonProperty("target_s3_prefix")
    String targetS3Prefix,

    @JsonProperty("topic_metrics")
    Map<String, Long> topicMetrics
) {}
