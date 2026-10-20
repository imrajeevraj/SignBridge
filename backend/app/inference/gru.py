"""One shared architecture for training and deployment; no implicit weights."""
import torch
from torch import nn
from .contracts import GRUConfig


class SignGRU(nn.Module):
    def __init__(self, classes: int, config: GRUConfig, input_size: int = 161):
        super().__init__()
        if input_size not in (161, 172): raise ValueError('Unsupported GRU input width.')
        self.input_size = input_size
        self.gru = nn.GRU(input_size, config.hidden_size, config.num_layers, batch_first=True,
                          dropout=config.dropout if config.num_layers > 1 else 0)
        self.head = nn.Sequential(nn.Linear(config.hidden_size, 64), nn.ReLU(), nn.Linear(64, classes))

    def forward(self, sequence: torch.Tensor) -> torch.Tensor:
        if sequence.ndim != 3 or tuple(sequence.shape[1:]) != (32, self.input_size):
            raise ValueError(f'Expected [batch,32,{self.input_size}].')
        _, hidden = self.gru(sequence)
        return self.head(hidden[-1])
