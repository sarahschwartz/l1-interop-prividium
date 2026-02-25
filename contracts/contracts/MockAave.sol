// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

contract MockAave {
    mapping(address account => uint256 balance) public balances;

    error UnauthorizedWithdrawCaller(address caller, address account);
    error InsufficientBalance(uint256 available, uint256 requested);
    error EthTransferFailed(address recipient, uint256 amount);

    event Deposited(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, address indexed recipient, uint256 amount);

    function depositETH(address _accountAddress) external payable {
        balances[_accountAddress] = balances[_accountAddress] + msg.value;
        emit Deposited(_accountAddress, msg.value);
    }

    function withdraw(address _recipient, uint256 _amount) external {
        uint256 balance = balances[msg.sender];
        if (balance < _amount) {
            revert InsufficientBalance(balance, _amount);
        }

        balances[msg.sender] = balance - _amount;

        (bool success, ) = payable(_recipient).call{value: _amount}("");
        if (!success) {
            revert EthTransferFailed(_recipient, _amount);
        }

        emit Withdrawn(msg.sender, _recipient, _amount);
    }
}
