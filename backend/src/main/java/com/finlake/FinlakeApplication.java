package com.finlake;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class FinlakeApplication {

    public static void main(String[] args) {
        SpringApplication.run(FinlakeApplication.class, args);
    }
}
