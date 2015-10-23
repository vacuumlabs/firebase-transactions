# Transactional Firebase

[![Circle CI](https://circleci.com/gh/vacuumlabs/firebase-transactions.svg?style=svg&circle-token=bd6366dee306c78c644fc6458085e673fe163723)](https://circleci.com/gh/vacuumlabs/firebase-transactions)

Firebase with transaction? Real transactions with all the ACID goodness? Are you kidding me? Yup, a
little. Some things are hard to achieve within firebase; however, there are quite strong guarantees
you got when using this.

## Benchmarks (poor mans)

based on randomized_complex test, we can process cca 50 transactions per second (each transaction
makes 6 read / write operations on average). Of course, if there are lot of conflicts, the speed
can decrease significantly.

## License

See LICENSE
