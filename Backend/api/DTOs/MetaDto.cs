namespace api.DTOs;

public record MetaDto(
    string DataVersion,
    string[] Sources,
    string[] Years
);