package com.finlake.controller;

import com.finlake.dto.KafkaPublishRequestDTO;
import com.finlake.dto.KafkaSinkStatusDTO;
import com.finlake.service.KafkaMinioSinkService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/kafka")
public class KafkaController {

    private final KafkaMinioSinkService sinkService;

    public KafkaController(KafkaMinioSinkService sinkService) {
        this.sinkService = sinkService;
    }

    @GetMapping("/status")
    public ResponseEntity<KafkaSinkStatusDTO> getStatus() {
        return ResponseEntity.ok(sinkService.getStatus());
    }

    @PostMapping("/publish")
    public ResponseEntity<Map<String, Object>> publishEvent(@Valid @RequestBody KafkaPublishRequestDTO request) {
        Map<String, Object> result = sinkService.publish(request);
        return ResponseEntity.ok(result);
    }

    @PostMapping("/sink/flush")
    public ResponseEntity<Map<String, Object>> flushSink(
            @RequestParam(defaultValue = "finlake.polyglot.events") String topic
    ) {
        Map<String, Object> result = sinkService.flushTopicToMinio(topic);
        return ResponseEntity.ok(result);
    }
}
